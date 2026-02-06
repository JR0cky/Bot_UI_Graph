import json
import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from scipy.stats import entropy
from scipy.cluster.hierarchy import dendrogram, linkage

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
# 2. Build Matrices
# -------------------------------------------------

def build_data_matrices(data):
    """
    Returns:
      bot_features_df: DataFrame (Index=Bots, Columns=Features, Value=1/0)
      bot_domains: Dict {bot_id: domain_id}
      feature_counts: Dict {feature_id: total_count}
    """
    bots = set()
    features = set()
    domains = set()
    
    # 1. Nodes
    for node in data["nodes"]:
        nid = node["data"]["id"]
        ntype = node["data"].get("nodeType")
        if ntype == "bot":
            bots.add(nid)
        elif ntype == "feature":
            features.add(nid)
        elif ntype == "domain":
            domains.add(nid)
            
    sorted_bots = sorted(list(bots))
    sorted_features = sorted(list(features))
    
    # 2. Mappings
    bot_to_domain = {}
    feature_to_bots = {f: set() for f in sorted_features}
    
    # 3. Edges
    for edge in data["edges"]:
        e = edge["data"]
        src = e["source"]
        tgt = e["target"]
        rel = e.get("relation")

        # Bot -> Domain (partOf)
        if rel == "partOf" and src in bots and tgt in domains:
            bot_to_domain[src] = tgt
            
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
    
    return df, bot_to_domain, domains

# -------------------------------------------------
# 3. Calculate Research Question Metrics
# -------------------------------------------------

def calculate_rq_metrics(df, bot_to_domain, all_domains):
    """
    RQ1: Domain Specificity (Entropy)
    RQ2: Consistency (Ubiquity)
    """
    
    metrics = []
    
    for feature in df.columns:
        # Which bots have this feature?
        bots_with_feature = df.index[df[feature] == 1].tolist()
        total_count = len(bots_with_feature)
        
        # 1. Ubiquity (% of all bots)
        ubiquity = total_count / len(df.index) if len(df.index) > 0 else 0
        
        # 2. Domain Distribution
        domain_counts = {d: 0 for d in all_domains}
        for bot in bots_with_feature:
            d = bot_to_domain.get(bot, "Unknown")
            if d in domain_counts:
                domain_counts[d] += 1
                
        # 3. Entropy (Domain Independence)
        # Normalize counts to probabilities
        if total_count > 0:
            probs = [count / total_count for count in domain_counts.values()]
            # Shannon entropy. Higher = More distributed (Domain Independent). Lower = Domain Specific.
            # Max entropy for 4 domains is log2(4) = 2.0
            ent = entropy(probs, base=2)
        else:
            ent = 0
            
        # 4. Dominant Domain
        if total_count > 0:
            dominant_domain = max(domain_counts, key=domain_counts.get)
            dom_count = domain_counts[dominant_domain]
            specificity_score = dom_count / total_count # % of occurences in top domain
        else:
            dominant_domain = "None"
            specificity_score = 0

        metrics.append({
            "Feature": feature,
            "Ubiquity": round(ubiquity, 3),
            "Occurrences": total_count,
            "Entropy": round(ent, 3), # High = shared, Low = specific
            "Top_Domain": dominant_domain,
            "Domain_Concentration": round(specificity_score, 3)
        })
        
    results_df = pd.DataFrame(metrics)
    return results_df

# -------------------------------------------------
# 4. Visualizations
# -------------------------------------------------

def plot_dendrograms(df, bot_to_domain, results_df):
    
    # --- RQ1: Bot Clustering (Do domains shape UI?) ---
    # Jaccard distance for binary data
    Z_bots = linkage(df, method='average', metric='jaccard')
    
    plt.figure(figsize=(10, 6))
    dendrogram(Z_bots, labels=df.index, leaf_rotation=90)
    plt.title("RQ1: Hierarchical Clustering of Chatbots by Features")
    plt.tight_layout()
    plt.savefig("rq1_dendrogram_bots.png", dpi=300)
    plt.close()
    print("Saved: rq1_dendrogram_bots.png")
    
    # --- RQ2: Feature Clustering (What features go together?) ---
    # Transpose df -> index=features
    Z_feats = linkage(df.T, method='average', metric='jaccard')
    
    plt.figure(figsize=(12, 8))
    dendrogram(Z_feats, labels=df.columns, leaf_rotation=90, leaf_font_size=8)
    plt.title("RQ2: Feature Co-occurrence Clusters")
    plt.tight_layout()
    plt.savefig("rq2_dendrogram_features.png", dpi=300)
    plt.close()
    print("Saved: rq2_dendrogram_features.png")

    # --- Domain Specificity Plot ---
    plt.figure(figsize=(10, 6))
    sns.scatterplot(data=results_df, x="Entropy", y="Ubiquity", hue="Top_Domain", style="Top_Domain", s=100)
    
    plt.axvline(x=1.8, color='gray', linestyle='--', alpha=0.5)
    plt.text(1.85, 0.9, "Universal", rotation=0)
    
    plt.axvline(x=0.5, color='gray', linestyle='--', alpha=0.5)
    plt.text(0.1, 0.9, "Domain Specific", rotation=0)
    
    plt.title("Feature Landscape: Specificity vs Ubiquity")
    plt.xlabel("Domain Independence (Entropy)")
    plt.ylabel("Ubiquity (% Bots)")
    plt.grid(True, alpha=0.3)
    plt.savefig("rq_feature_landscape.png", dpi=300)
    plt.close()
    print("Saved: rq_feature_landscape.png")


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
    df, bot_to_domain, all_domains = build_data_matrices(data)
    
    print(f"Loaded {len(df)} bots, {len(df.columns)} features.")
    
    # Run Metrics
    results = calculate_rq_metrics(df, bot_to_domain, all_domains)
    
    # Sort for report
    results = results.sort_values(by=["Ubiquity", "Entropy"], ascending=False)
    
    print("\n--- Top Universal Features (RQ2) ---")
    print(results.head(5)[["Feature", "Ubiquity", "Entropy"]])
    
    print("\n--- Top Domain Specific Features (RQ1) ---")
    specific = results[results["Entropy"] < 0.8].sort_values(by="Domain_Concentration", ascending=False)
    print(specific.head(5)[["Feature", "Top_Domain", "Domain_Concentration"]])
    
    # Save Report
    results.to_csv("analysis_results.csv", index=False)
    print("\nSaved: analysis_results.csv")
    
    # Plot
    plot_dendrograms(df, bot_to_domain, results)
