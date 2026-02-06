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

def make_node(node_id, node_type, label, description=None, **attrs):
    data = {
        "id": node_id,
        "nodeType": node_type,
        "label": label,
    }
    if description is not None:
        data["description"] = description
    data.update(attrs)
    return {"data": data}

def make_edge(source, target, relation, **attrs):
    edge_id = f"{source}_{target}_{relation}"
    data = {
        "id": edge_id,
        "source": source,
        "target": target,
        "relation": relation,
        "label": attrs.pop("label", relation),
    }
    data.update(attrs)
    return {"data": data}

def is_true(val):
    return str(val).strip().lower() == "x"

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
# Pre-computation: Bot → Domain
# --------------------------------------------------

bot_to_domain = {}

with FEATURES_CSV.open(mode="r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        bot = row.get("Bot", "").strip()
        domain = row.get("Domain", "").strip()
        if bot and domain:
            bot_id = slugify(bot)
            bot_to_domain.setdefault(bot_id, domain)

# --------------------------------------------------
# Bots + Domains
# --------------------------------------------------

bots = set()

with BOTS_CSV.open(mode="r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        bot_id = slugify(row["Bot"])
        bots.add(bot_id)

        add_node(make_node(
            bot_id,
            "bot",
            row["Bot"],
            description=row.get("Description", "").strip()
        ))

        domain = bot_to_domain.get(bot_id)
        if domain:
            domain_id = slugify(domain)
            add_node(make_node(domain_id, "domain", domain))
            edges.append(make_edge(bot_id, domain_id, "partOf"))

# --------------------------------------------------
# Feature groups + Features
# --------------------------------------------------

features = {}
feature_groups = {}

with FEATURES_CSV.open(mode="r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        feature_id = slugify(row["Class"])
        group_label = row["Feature Group"]
        group_id = slugify(group_label)

        if group_id not in feature_groups:
            feature_groups[group_id] = group_label
            add_node(make_node(group_id, "feature_group", group_label))

        features[feature_id] = row

        add_node(make_node(
            feature_id,
            "feature",
            row["Class"],
            row.get("Description", "").strip(),
            groupId=group_id,
            **{"class": row["Class"]}
        ))

        edges.append(make_edge(feature_id, group_id, "partOf"))

# --------------------------------------------------
# Feature ↔ Feature relations
# --------------------------------------------------

for fid, row in features.items():
    rel = row.get("relation", "").strip()
    tgt = row.get("relation_target", "").strip()
    if rel and tgt:
        tid = slugify(tgt)
        if tid in features:
            edges.append(make_edge(fid, tid, rel))

# --------------------------------------------------
# Screenshots
# --------------------------------------------------

screenshots = defaultdict(lambda: defaultdict(list))

with SCREENSHOTS_CSV.open(mode="r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        fid = slugify(row["Class"])
        bid = slugify(row["Bot"])
        raw_paths = row.get("Screenshots", "").strip()
        if fid in features and bid in bots and raw_paths:
            # Handle comma-separated paths (e.g. "img1.png, img2.png")
            paths = [p.strip() for p in raw_paths.split(',')]
            for p in paths:
                if p:
                    screenshots[fid][bid].append(p)

for node in nodes:
    if node["data"]["nodeType"] == "feature":
        fid = node["data"]["id"]
        if fid in screenshots:
            node["data"]["screenshots"] = dict(screenshots[fid])

# --------------------------------------------------
# Bot → Feature edges (base + permissions)
# --------------------------------------------------

base_edges = {}

# Base hasFeature edges (from FEATURES_CSV)
with FEATURES_CSV.open(mode="r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)
    for row in reader:
        # Check "Code" column ("x" = has feature)
        if not is_true(row.get("Code", "")):
            continue

        bot_id = slugify(row.get("Bot", ""))
        feature_id = slugify(row.get("Class", ""))
        if bot_id in bots and feature_id in features:
            base_edges[(bot_id, feature_id)] = make_edge(
                bot_id,
                feature_id,
                "hasFeature"
            )

# Permission upgrades (from MESSAGES_CSV)
with MESSAGES_CSV.open(mode="r", encoding="utf-8", newline="") as f:
    reader = csv.reader(f)
    next(reader, None)  # skip header

    for row in reader:
        if len(row) < 4:
            continue

        bot_id = slugify(row[0])
        feature_id = slugify(row[1])
        bot_can = is_true(row[2])
        user_can = is_true(row[3])

        if (bot_id, feature_id) not in base_edges:
            continue

        if bot_can or user_can:
            if bot_can and user_can:
                label = "Exchange ⇄"
            elif bot_can:
                label = "Bot Output 🤖"
            else:
                label = "User Input 👤"

            base_edges[(bot_id, feature_id)] = make_edge(
                bot_id,
                feature_id,
                "hasFeature",
                label=label,
                bot_can_send=bot_can,
                user_can_send=user_can
            )

# Emit hasFeature edges exactly once
edges.extend(base_edges.values())

# --------------------------------------------------
# Write graph
# --------------------------------------------------

graph = {
    "nodes": nodes,
    "edges": edges
}

with OUTPUT_JSON.open(mode="w", encoding="utf-8") as f:
    json.dump(graph, f, indent=2)

print(f"Graph written to {OUTPUT_JSON}")
