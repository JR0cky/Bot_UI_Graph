from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from sklearn.cluster import AgglomerativeClustering, SpectralClustering
from sklearn.metrics.pairwise import cosine_similarity

import numpy as np
import networkx as nx
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

# -----------------------------
# API Routes
# -----------------------------
@app.get("/graph")
def get_graph():
    data_path = os.path.join(os.path.dirname(__file__), "static_graph.json")
    if not os.path.exists(data_path):
        return {"error": "static_graph.json not found. Please run the conversion script."}

    with open(data_path, "r") as f:
        data = json.load(f)
    return data


@app.post("/cluster")
def cluster_graph(algorithm: str = "spectral"):

    # -----------------------------
    # Load graph JSON
    # -----------------------------
    data_path = os.path.join(os.path.dirname(__file__), "static_graph.json")
    if not os.path.exists(data_path):
        return {"error": "static_graph.json not found"}

    with open(data_path, "r") as f:
        data = json.load(f)

    # -----------------------------
    # Build node type lookup
    # -----------------------------
    node_type = {}
    for node in data["nodes"]:
        nid = node["data"]["id"]
        node_type[nid] = node["data"].get("nodeType")

    bots = [n for n in node_type if node_type[n] == "bot"]
    features = [n for n in node_type if node_type[n] == "feature"]
    domains = [n for n in node_type if node_type[n] == "domain"]

    # -----------------------------
    # Build graph with relations
    # -----------------------------
    G = nx.Graph()
    for node_id in node_type:
        G.add_node(node_id)

    for edge in data["edges"]:
        src = edge["data"]["source"]
        tgt = edge["data"]["target"]
        rel = edge["data"].get("relation", "generic")
        G.add_edge(src, tgt, relation=rel)

    clusters = {}

    # ============================================================
    # 1. Greedy Modularity (kept as-is, but not ideal here)
    # ============================================================
    if algorithm == "greedy_modularity":
        try:
            communities = nx.community.greedy_modularity_communities(G)
            for i, comm in enumerate(communities):
                for node_id in comm:
                    clusters[node_id] = i
        except Exception as e:
            return {"error": str(e)}

    # ============================================================
    # 2. Spectral Clustering (FIXED: bots clustered by features)
    # ============================================================
    elif algorithm == "spectral":
        try:
            # --- Build bot-feature incidence matrix ---
            bot_index = {b: i for i, b in enumerate(bots)}
            feat_index = {f: j for j, f in enumerate(features)}

            X = np.zeros((len(bots), len(features)))

            for u, v, attrs in G.edges(data=True):
                if attrs.get("relation") == "hasFeature":
                    if u in bot_index and v in feat_index:
                        X[bot_index[u], feat_index[v]] = 1
                    elif v in bot_index and u in feat_index:
                        X[bot_index[v], feat_index[u]] = 1

            # --- Similarity between bots ---
            similarity = cosine_similarity(X)

            # Use domain count as meaningful default
            n_clusters = min(4, len(bots))

            sc = SpectralClustering(
                n_clusters=n_clusters,
                affinity="precomputed",
                assign_labels="discretize",
                random_state=42
            )

            labels = sc.fit_predict(similarity)

            # Assign bot clusters
            for i, bot in enumerate(bots):
                clusters[bot] = int(labels[i])

            # Propagate cluster labels back to connected domains/features
            for edge in data["edges"]:
                src = edge["data"]["source"]
                tgt = edge["data"]["target"]
                rel = edge["data"].get("relation")

                if rel == "partOf" and src in clusters:
                    clusters[tgt] = clusters[src]

                if rel == "hasFeature" and src in clusters:
                    clusters[tgt] = clusters[src]

        except Exception as e:
            return {"error": f"Spectral error: {str(e)}"}


    # ============================================================
    # 4. Domain Baseline (kept exactly as you wrote)
    # ============================================================
    elif algorithm == "domain":
        try:
            domain_clusters = {}
            next_cluster_id = 0

            # Assign domains
            for d in domains:
                domain_clusters[d] = next_cluster_id
                clusters[d] = next_cluster_id
                next_cluster_id += 1

            bot_to_domain = {}
            feature_connections = {}

            for edge in data["edges"]:
                src = edge["data"]["source"]
                tgt = edge["data"]["target"]
                rel = edge["data"]["relation"]

                if rel == "partOf" and tgt in domain_clusters:
                    clusters[src] = domain_clusters[tgt]
                    bot_to_domain[src] = domain_clusters[tgt]

                if rel == "hasFeature":
                    feature_connections.setdefault(tgt, []).append(src)

            for fid, bot_list in feature_connections.items():
                counts = {}
                for bid in bot_list:
                    if bid in bot_to_domain:
                        cid = bot_to_domain[bid]
                        counts[cid] = counts.get(cid, 0) + 1

                if counts:
                    best = max(counts, key=counts.get)
                    clusters[fid] = best

        except Exception as e:
            return {"error": f"Domain clustering error: {str(e)}"}

    # ============================================================
    # 5. Agglomerative (Hidden Similarities / Bot Types)
    # ============================================================
    elif algorithm == "agglomerative":
        try:
            from sklearn.cluster import AgglomerativeClustering
            from itertools import combinations
            
            # 1. Build Bot Projection (Jaccard)
            bot_features = {b: set() for b in bots}
            feature_to_bots = {}
            
            for edge in data["edges"]:
                d = edge["data"]
                src = d["source"]
                tgt = d["target"]
                rel = d.get("relation")
                
                if rel == "hasFeature":
                    b, f = None, None
                    if src in bots and tgt in features: b, f = src, tgt
                    elif tgt in bots and src in features: b, f = tgt, src
                    
                    if b and f:
                        bot_features[b].add(f)
                        feature_to_bots.setdefault(f, []).append(b)

            # Build Distance Matrix (1 - Jaccard)
            n_bots = len(bots)
            dist_mat = np.ones((n_bots, n_bots)) # Default max distance
            np.fill_diagonal(dist_mat, 0)
            
            bot_list = list(bots)
            bot_idx = {b: i for i, b in enumerate(bot_list)}
            
            for b1, b2 in combinations(bot_list, 2):
                f1 = bot_features[b1]
                f2 = bot_features[b2]
                
                intersection = len(f1 & f2)
                union = len(f1 | f2)
                
                if union > 0:
                    jaccard = intersection / union
                    dist = 1.0 - jaccard
                    i, j = bot_idx[b1], bot_idx[b2]
                    dist_mat[i, j] = dist_mat[j, i] = dist

            # 2. Cluster
            # k=4 based on our analysis showing meaningful groups
            ac = AgglomerativeClustering(n_clusters=4, metric='precomputed', linkage='average')
            labels = ac.fit_predict(dist_mat)
            
            # 3. Assign to Bots
            for i, b in enumerate(bot_list):
                clusters[b] = int(labels[i])
                
            # 4. Propagate to Features/Domains (Simple Majority Vote)
            # Assign features to the cluster of the bots that use them most
            for fid, b_list in feature_to_bots.items():
                counts = {}
                for b in b_list:
                    if b in clusters:
                        c = clusters[b]
                        counts[c] = counts.get(c, 0) + 1
                if counts:
                    best_c = max(counts, key=counts.get)
                    clusters[fid] = best_c
            
            # Assign domains to the cluster of their bots
            domain_votes = {}
            for edge in data["edges"]:
                src = edge["data"]["source"]
                tgt = edge["data"]["target"]
                rel = edge["data"].get("relation")
                if rel == "partOf" and src in bots and tgt in domains:
                    if src in clusters:
                        c = clusters[src]
                        domain_votes.setdefault(tgt, {}).setdefault(c, 0)
                        domain_votes[tgt][c] += 1
            
            for d, counts in domain_votes.items():
                if counts:
                    best_c = max(counts, key=counts.get)
                    clusters[d] = best_c

        except Exception as e:
            return {"error": f"Agglomerative error: {str(e)}"}

    else:
        return {"error": f"Unknown algorithm: {algorithm}"}

    return clusters


# -----------------------------
# Mount static frontend
# -----------------------------
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/assets", StaticFiles(directory=os.path.join(frontend_path, "assets")), name="assets")


@app.get("/{file_path:path}")
async def serve_frontend(file_path: str):
    if file_path == "" or file_path == "/":
        return FileResponse(os.path.join(frontend_path, "index.html"))

    full_path = os.path.join(frontend_path, file_path)
    if os.path.exists(full_path) and os.path.isfile(full_path):
        return FileResponse(full_path)

    return FileResponse(os.path.join(frontend_path, "index.html"))
