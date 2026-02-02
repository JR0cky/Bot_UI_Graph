import csv
import json
from collections import defaultdict
from pathlib import Path

# --------------------------------------------------
# Paths
# --------------------------------------------------

BASE_DIR = Path(__file__).parent.resolve()

FEATURES_CSV = BASE_DIR / "data" / "final_annotation_features.csv"
MESSAGES_CSV = BASE_DIR / "data" / "final_annotation_messages.csv"
BOTS_CSV = BASE_DIR / "data" / "final_annotation_bot_description.csv"
SCREENSHOTS_CSV = BASE_DIR / "data" / "screenshots.csv"

OUTPUT_JSON = BASE_DIR / "static_graph.json"

# --------------------------------------------------
# Helpers
# --------------------------------------------------

def slugify(text: str) -> str:
    return (
        text.strip()
        .lower()
        .replace(" ", "_")
        .replace("/", "_")
        .replace("-", "_")
    )

def make_node(node_id, node_type, label, **attrs):
    data = {
        "id": node_id,
        "nodeType": node_type,
        "label": label
    }
    data.update(attrs)
    return {"data": data}

def make_edge(source, target, relation, **attrs):
    edge_id = f"{source}_{target}_{relation}"
    data = {
        "id": edge_id,
        "source": source,
        "target": target,
        "relation": relation,
        "label": relation
    }
    data.update(attrs)
    return {"data": data}

def is_true(val):
    return str(val).strip().lower() == "x"

def split_multi(val):
    if not val:
        return []
    return [v.strip() for v in val.split(";") if v.strip()]

# --------------------------------------------------
# Containers
# --------------------------------------------------

nodes = []
edges = []
node_ids = set()

def add_node(node):
    nid = node["data"]["id"]
    if nid not in node_ids:
        nodes.append(node)
        node_ids.add(nid)

# --------------------------------------------------
# 1️⃣ User node
# --------------------------------------------------

add_node(make_node("user", "user", "User"))

# --------------------------------------------------
# 2️⃣ Bots + Domains
# --------------------------------------------------

bots = set()

with BOTS_CSV.open(mode="r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        bot_id = slugify(row["bot"])
        bots.add(bot_id)

        add_node(
            make_node(
                bot_id,
                "bot",
                row["bot"],
                description=row.get("description", "").strip()
            )
        )

        domain = row.get("domain", "").strip()
        if domain:
            domain_id = slugify(domain)
            add_node(make_node(domain_id, "domain", domain))
            edges.append(make_edge(bot_id, domain_id, "partOf"))

# --------------------------------------------------
# 3️⃣ Feature groups + Features
# --------------------------------------------------

features = {}
feature_groups = {}

with FEATURES_CSV.open(mode="r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)

    for row in reader:
        feature_id = slugify(row["class"])
        feature_label = row["feature"]
        group_label = row["feature_group"]

        # Feature group
        group_id = slugify(group_label)
        if group_id not in feature_groups:
            feature_groups[group_id] = group_label
            add_node(make_node(group_id, "feature_group", group_label))

        # Feature
        features[feature_id] = row
        add_node(
            make_node(
                feature_id,
                "feature",
                feature_label,
                description=row.get("description", "").strip(),
                **{"class": row["class"]}
            )
        )

        # Feature → group
        edges.append(make_edge(feature_id, group_id, "partOf"))

# --------------------------------------------------
# 4️⃣ Feature ↔ Feature semantic relations
# --------------------------------------------------

for feature_id, row in features.items():
    rel = row.get("relation", "").strip()
    target = row.get("relation_target", "").strip()

    if rel and target:
        target_id = slugify(target)
        if target_id in features:
            edges.append(make_edge(feature_id, target_id, rel))

# --------------------------------------------------
# 5️⃣ Screenshot aggregation (STRICTLY from screenshots.csv)
# --------------------------------------------------

screenshots = defaultdict(lambda: defaultdict(list))

with SCREENSHOTS_CSV.open(mode="r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)

    for row in reader:
        feature_id = slugify(row["class"])
        bot_id = slugify(row["bot"])
        path = row.get("screenshot", "").strip()

        if feature_id in features and bot_id in bots and path:
            screenshots[feature_id][bot_id].append(path)

# Attach screenshots to feature nodes
for node in nodes:
    if node["data"]["nodeType"] == "feature":
        fid = node["data"]["id"]
        if fid in screenshots:
            node["data"]["screenshots"] = dict(screenshots[fid])

# --------------------------------------------------
# 6️⃣ Bot → Feature edges with permissions
# --------------------------------------------------

with MESSAGES_CSV.open(mode="r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)

    for row in reader:
        feature_id = slugify(row["class"])
        if feature_id not in features:
            continue

        for bot_id in bots:
            user_val = row.get(f"{bot_id}_user", "")
            bot_val = row.get(f"{bot_id}_bot", "")

            if is_true(user_val) or is_true(bot_val):
                edges.append(
                    make_edge(
                        bot_id,
                        feature_id,
                        "hasFeature",
                        user_can_send=is_true(user_val),
                        bot_can_send=is_true(bot_val)
                    )
                )

# --------------------------------------------------
# 7️⃣ Write graph
# --------------------------------------------------

graph = {
    "nodes": nodes,
    "edges": edges
}

with OUTPUT_JSON.open(mode="w", encoding="utf-8") as f:
    json.dump(graph, f, indent=2)

print(f"Graph written to {OUTPUT_JSON}")
