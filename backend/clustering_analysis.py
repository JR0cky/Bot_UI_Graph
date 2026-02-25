import json
import os
import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import fcluster, linkage
from sklearn.metrics import silhouette_score
from sklearn.tree import DecisionTreeClassifier, export_text

# -------------------------------------------------
# 1. Load Data
# -------------------------------------------------

def load_graph(path):
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return None
    with open(path, "r") as f:
        return json.load(f)

# -------------------------------------------------
# 2. Build Matrices (Same logic as analyze_rq.py)
# -------------------------------------------------

def build_data_matrices(data):
    """
    Returns:
      bot_features_df: DataFrame (Index=Bots, Columns=Features, Value=1/0)
    """
    bots = set()
    features = set()
    
    # 1. Nodes
    for node in data["nodes"]:
        nid = node["data"]["id"]
        ntype = node["data"].get("nodeType")
        if ntype == "bot":
            bots.add(nid)
        elif ntype == "feature":
            features.add(nid)
            
    sorted_bots = sorted(list(bots))
    sorted_features = sorted(list(features))
    
    # 2. Mappings
    feature_to_bots = {f: set() for f in sorted_features}
    
    # 3. Edges
    for edge in data["edges"]:
        e = edge["data"]
        src = e["source"]
        tgt = e["target"]
        rel = e.get("relation")

        # Bot -> Feature (hasFeature)
        if rel == "hasFeature":
            if src in bots and tgt in features:
                feature_to_bots[tgt].add(src)
            elif tgt in bots and src in features:
                feature_to_bots[src].add(tgt)

    # 4. Build DataFrame
    matrix = np.zeros((len(sorted_bots), len(sorted_features)), dtype=int)
    
    for c_idx, feat in enumerate(sorted_features):
        for r_idx, bot in enumerate(sorted_bots):
            if bot in feature_to_bots[feat]:
                matrix[r_idx, c_idx] = 1

    df = pd.DataFrame(matrix, index=sorted_bots, columns=sorted_features)
    
    return df

# -------------------------------------------------
# 3. Analyze Clusters
# -------------------------------------------------

def analyze_clusters(df, n_clusters=None):
    """
    Performs Agglomerative Clustering and analyzes the contribution of each feature to each cluster.
    If n_clusters is None, it uses Silhouette Score to automatically find the optimal number of clusters.
    """
    if len(df) == 0:
        print("Empty dataframe.")
        return None

    # Perform clustering using the same parameters as analyze_rq.py dendrogram
    # Jaccard distance for binary data
    Z_bots = linkage(df, method='average', metric='jaccard')
    
    if n_clusters is None:
        best_k = 2
        best_score = -1
        max_k = min(8, len(df) - 1)
        if max_k >= 2:
            for k in range(2, max_k + 1):
                labels = fcluster(Z_bots, k, criterion='maxclust')
                if len(set(labels)) > 1:
                    score = silhouette_score(df, labels, metric='jaccard')
                    if score > best_score:
                        best_score = score
                        best_k = k
            n_clusters = best_k
            print(f"Auto-selected optimal number of clusters: k={n_clusters} (Silhouette Score: {best_score:.3f})")
        else:
            n_clusters = 2

    # Extract flat clusters
    cluster_labels = fcluster(Z_bots, n_clusters, criterion='maxclust')
    
    # Add cluster labels to the dataframe for analysis
    df_clustered = df.copy()
    df_clustered['Cluster'] = cluster_labels
    
    print(f"\n--- Clustering Analysis (k={n_clusters}) ---")
    cluster_sizes = df_clustered['Cluster'].value_counts().sort_index()
    print("Cluster Sizes:")
    for c, size in cluster_sizes.items():
        print(f"  Cluster {c}: {size} bots")
    
    # Global feature presence (percentage of all bots having the feature)
    global_presence = df.mean()
    
    feature_metrics = []
    
    for cluster_id in range(1, n_clusters + 1):
        cluster_bots = df_clustered[df_clustered['Cluster'] == cluster_id].drop(columns=['Cluster'])
        
        # Percentage of bots in THIS cluster having the feature
        cluster_presence = cluster_bots.mean()
        
        for feature in df.columns:
            g_rate = global_presence[feature]
            c_rate = cluster_presence[feature]
            
            # Difference from global presence. 
            # Positive means it's overrepresented in this cluster.
            # Negative means it's underrepresented in this cluster.
            diff_from_global = c_rate - g_rate
            
            feature_metrics.append({
                'Cluster': cluster_id,
                'Feature': feature,
                'Cluster_Presence': round(c_rate, 3),
                'Global_Presence': round(g_rate, 3),
                'Diff_From_Global': round(diff_from_global, 3)
            })
            
    metrics_df = pd.DataFrame(feature_metrics)
    
    return metrics_df, df_clustered

# -------------------------------------------------
# Main
# -------------------------------------------------

if __name__ == "__main__":
    
    input_file = "static_graph.json"
    if not os.path.exists(input_file):
        # Fallback for running from root
        input_file = "backend/static_graph.json"
        
    if not os.path.exists(input_file):
        print("Error: static_graph.json not found.")
        exit()
        
    data = load_graph(input_file)
    df = build_data_matrices(data)
    
    print(f"Loaded {len(df)} bots, {len(df.columns)} features.")
    
    # Choose number of clusters for analysis, set to None for auto-detection
    K_CLUSTERS = None
    results, df_clustered = analyze_clusters(df, n_clusters=K_CLUSTERS)
    
    if results is not None:
        clusters = sorted(df_clustered['Cluster'].unique())
        
        # Print top features for each cluster
        for c in clusters:
            cluster_results = results[results['Cluster'] == c]
            bots_in_cluster = df_clustered[df_clustered['Cluster'] == c].index.tolist()
            
            print(f"\n--- Bots in Cluster {c} [{len(bots_in_cluster)}] ---")
            print(", ".join(bots_in_cluster))
            
            # Top defining features (highest presence in this cluster AND significantly higher than global)
            # Sort by Difference from Global to find what distinguishes it most from the rest
            top_features = cluster_results.sort_values(by=['Diff_From_Global', 'Cluster_Presence'], ascending=[False, False])
            
            print(f"\nTop distinguishing features for Cluster {c}:")
            print(top_features.head(10)[['Feature', 'Cluster_Presence', 'Global_Presence', 'Diff_From_Global']].to_string(index=False))
            
            print("\nMost common features:")
            top_common = cluster_results.sort_values(by=['Cluster_Presence'], ascending=[False])
            print(top_common.head(5)[['Feature', 'Cluster_Presence', 'Global_Presence']].to_string(index=False))
            print("-" * 50)
            
        print("\n=======================================================")
        print("DECISION TREE (Defining inherent structures and crossroads)")
        print("=======================================================")
        tree_clf = DecisionTreeClassifier(random_state=42, max_depth=4)
        tree_clf.fit(df, df_clustered['Cluster'])
        
        tree_rules = export_text(tree_clf, feature_names=list(df.columns))
        print(tree_rules)
            
        output_file = "cluster_feature_analysis.csv"
        results.to_csv(output_file, index=False)
        print(f"\nSaved full cluster-feature analysis to {output_file}")
