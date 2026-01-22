from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import json
import os

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
@app.get("/graph")
def get_graph():
    data_path = os.path.join(os.path.dirname(__file__), "static_graph.json")
    if not os.path.exists(data_path):
        return {"error": "static_graph.json not found. Please run the conversion script."}
    
    with open(data_path, "r") as f:
        data = json.load(f)
    return data

@app.post("/cluster")
def cluster_graph(algorithm: str = "louvain"):
    import networkx as nx
    
    # Load graph
    data_path = os.path.join(os.path.dirname(__file__), "static_graph.json")
    if not os.path.exists(data_path):
        return {"error": "static_graph.json not found"}
    
    with open(data_path, "r") as f:
        data = json.load(f)
        
    G = nx.Graph()
    for node in data["nodes"]:
        G.add_node(node["data"]["id"])
    for edge in data["edges"]:
        G.add_edge(edge["data"]["source"], edge["data"]["target"])
        
    clusters = {}
    
    if algorithm == "louvain":
        try:
            import community.community_louvain as community_louvain
            partition = community_louvain.best_partition(G)
            # Partition is {node_id: cluster_id}
            # Louvain is non-deterministic, use specific seed if possible
            # community_louvain.best_partition accepts random_state since v0.16
            clusters = partition = community_louvain.best_partition(G, random_state=42)
        except TypeError:
            # Fallback if older version
            clusters = community_louvain.best_partition(G)
        except ImportError:
            return {"error": "python-louvain not installed"}
            
    elif algorithm == "greedy_modularity":
        # Built-in NetworkX greedy_modularity search handles ties arbitrarily but is generally deterministic (?)
        # It doesn't accept a seed, but uses Python's randomization for sort. 
        # We can try to sort graph nodes first to make it deterministic?
        try:
            # Sort nodes to ensure deterministic node processing order
            H = nx.Graph()
            H.add_nodes_from(sorted(G.nodes(data=True)))
            H.add_edges_from(G.edges(data=True))
            
            communities = nx.community.greedy_modularity_communities(H)
            # communities is list of sets
            for i, comm in enumerate(communities):
                for node_id in comm:
                    clusters[node_id] = i
        except Exception as e:
            return {"error": str(e)}

    elif algorithm == "spectral":
        try:
            from sklearn.cluster import SpectralClustering
            import numpy as np
            
            # Map nodes to indices (sorted for consistency)
            nodes = sorted(list(G.nodes()))
            node_to_idx = {n: i for i, n in enumerate(nodes)}
            adj_matrix = nx.to_numpy_array(G, nodelist=nodes)
            
            # Estimate clusters (sqrt(n/2) rule of thumb or default 8)
            n_clusters = max(2, int(np.sqrt(len(nodes)/2))) 
            
            sc = SpectralClustering(n_clusters=n_clusters, affinity='precomputed', n_init=10, assign_labels='discretize', random_state=42)
            labels = sc.fit_predict(adj_matrix)
            
            for i, label in enumerate(labels):
                clusters[nodes[i]] = int(label)
        except Exception as e:
            return {"error": f"Spectral error: {str(e)}"}

    elif algorithm == "agglomerative":
        try:
            from sklearn.cluster import AgglomerativeClustering
            import numpy as np
            
            # Map nodes to indices
            nodes = list(G.nodes())
            adj_matrix = nx.to_numpy_array(G, nodelist=nodes)
            
            # Use basic adj matrix as 'connectivity' if possible, or just features?
            # Creating distance matrix from adjacency? 
            # Simple approach: default Euclidean on adj matrix (treating rows as feature vectors)
            
            n_clusters = max(2, int(np.sqrt(len(nodes)/2)))
            ac = AgglomerativeClustering(n_clusters=n_clusters)
            labels = ac.fit_predict(adj_matrix)
            
            for i, label in enumerate(labels):
                clusters[nodes[i]] = int(label)
        except Exception as e:
            return {"error": f"Agglomerative error: {str(e)}"}
            
    else:
        return {"error": f"Unknown algorithm: {algorithm}"}
        
    return clusters

# Mount static files
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/assets", StaticFiles(directory=os.path.join(frontend_path, "assets")), name="assets")

# Serve index.html and other static files
@app.get("/{file_path:path}")
async def serve_frontend(file_path: str):
    # If root, serve index.html
    if file_path == "" or file_path == "/":
        return FileResponse(os.path.join(frontend_path, "index.html"))
    
    # Check if file exists in frontend directory
    full_path = os.path.join(frontend_path, file_path)
    if os.path.exists(full_path) and os.path.isfile(full_path):
        return FileResponse(full_path)
    
    # Fallback to index.html for SPA routing usually, but here just 404 is fine or index
    # For now, if not found, we can return index.html or 404. 
    # Since this is a simple static site, let's keep it simple.
    # Actually, better way is to mount "/" at the END to catch everything else
    return FileResponse(os.path.join(frontend_path, "index.html"))