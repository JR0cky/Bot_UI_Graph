let cy;

const colors = {
    // Accessible Okabe-Ito Palette for Distinct Node Types

    // Bot: Vermilion (Action/Agent)
    bot: ['#FF8533', '#D55E00', '#A04000'],

    // Domain: Bluish Green (Structure/Area)
    domain: ['#33C297', '#009E73', '#00664A'],

    // User: Sky Blue (Friendly/Distinct from Bot)
    user: ['#8ACDF2', '#56B4E9', '#3080B0'],

    // Feature Group: Grey (Neutral Container)
    feature_group: ['#AAAAAA', '#888888', '#555555'],

    // Feature Class: Orange (Warm/Category)
    feature_class: ['#FFBF40', '#E69F00', '#B37500'],

    // Feature Subclass: Yellow (Bright/Sub-category)
    feature_subclass: ['#F9EF85', '#F0E442', '#BDB115'],

    // UI Element: Blue (Strong/Cool)
    ui_element: ['#3399E6', '#0072B2', '#004D80'],

    // Interaction: Reddish Purple (Distinct Action)
    interaction: ['#E0A3C2', '#CC79A7', '#994D73'],

    // Fallback
    unknown: ['#999999', '#666666', '#333333']
};



async function initGraph() {
    try {
        const response = await fetch('/graph');
        const elements = await response.json();

        if (elements.error) {
            console.error('Backend error:', elements.error);
            alert(`Error: ${elements.error}`);
            return;
        }

        cy = cytoscape({
            container: document.getElementById('cy'),
            elements: elements,
            style: [
                {
                    selector: 'node',
                    style: {
                        'label': 'data(label)',
                        'color': '#334155',
                        'font-size': '10px', // Smaller font
                        'font-weight': '600',
                        'text-valign': 'center',
                        'text-margin-y': '35px',
                        'width': 45,
                        'height': 45,
                        'transition-property': 'background-color, line-color, target-arrow-color, width, height, opacity',
                        'transition-duration': '0.3s',
                        'background-fill': 'linear-gradient',
                        'background-gradient-stop-colors': (node) => {
                            const c = colors[node.data('nodeType')] || colors.unknown;
                            return `${c[0]} ${c[1]} ${c[2]}`; // 3 Shades
                        },
                        'background-gradient-stop-positions': '0% 50% 100%',
                        'background-gradient-direction': 'to-bottom-right', // Lower Right
                        'border-width': 0,
                        'border-color': (node) => {
                            const c = colors[node.data('nodeType')] || colors.unknown;
                            return c[1]; // Use the base dark shade for border
                        },
                        'shadow-blur': 8,
                        'shadow-color': 'rgba(0,0,0,0.15)',
                        'shadow-offset-y': 3
                    }
                },
                {
                    selector: 'node[nodeType="bot"]',
                    style: {
                        'width': 75,
                        'height': 75,
                        'font-size': '12px', // Smaller font
                        'font-weight': 'bold',
                        'text-margin-y': '50px'
                    }
                },
                {
                    selector: 'node:selected',
                    style: {
                        'border-width': 4,
                        'border-color': '#0d9488',
                        'shadow-blur': 20,
                        'shadow-color': 'rgba(13, 148, 136, 0.3)'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 1.5,
                        'line-color': '#94a3b8',
                        'target-arrow-color': '#94a3b8',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'label': 'data(label)',
                        'font-size': '9px', // Smaller font
                        'text-background-opacity': 1,
                        'text-background-color': '#f8fafc',
                        'text-background-padding': '3px',
                        'text-background-shape': 'roundrectangle',
                        'edge-text-rotation': 'autorotate',
                        'text-margin-y': '0px', // Centered on the line
                        'text-opacity': 1
                    }
                },
                {
                    selector: '.faded',
                    style: {
                        'opacity': 0.1,
                        'text-opacity': 0
                    }
                },
                {
                    selector: '.highlighted',
                    style: {
                        'opacity': 1,
                        'text-opacity': 1,
                        'z-index': 9999
                    }
                }
            ],
            layout: {
                name: 'cose',
                animate: true,
                animationDuration: 1000, // Smooth 1s animation
                randomize: true,
                padding: 50,
                componentSpacing: 250, // Push disconnected components apart
                nodeRepulsion: (node) => 800000, // Strong repulsion to push nodes apart
                idealEdgeLength: (edge) => 150, // Longer edges
                nodeOverlap: 20,
                refresh: 20,
                fit: true,
                gravity: 1
            }
        });

        cy.on('tap', 'node', function (evt) {
            const node = evt.target;
            showDetails(node.data());
        });

        cy.on('tap', function (evt) {
            if (evt.target === cy) {
                hideDetails();
            }
        });

        // Hover Highlighting
        cy.on('mouseover', 'node', (e) => {
            // Disable if clustering is active (Reset button is visible)
            if (document.getElementById('reset-clustering-btn').style.display !== 'none') return;

            const node = e.target;
            cy.batch(() => {
                // Fade everything
                cy.elements().addClass('faded');

                // Highlight neighborhood
                const neighborhood = node.neighborhood().add(node);
                neighborhood.removeClass('faded').addClass('highlighted');
            });
        });

        cy.on('mouseout', 'node', (e) => {
            // Disable if clustering is active
            if (document.getElementById('reset-clustering-btn').style.display !== 'none') return;

            cy.batch(() => {
                cy.elements().removeClass('faded highlighted');
            });
        });

        generateDynamicFilters(elements);
        initWalkthroughUI(elements); // Init Walkthrough
        applyFilters(); // Apply initial state

        // Label Toggles
        const nodeLabelToggle = document.getElementById('toggle-node-labels');
        if (nodeLabelToggle) {
            nodeLabelToggle.addEventListener('change', (e) => {
                cy.style().selector('node').style('text-opacity', e.target.checked ? 1 : 0).update();
            });
        }

        const edgeLabelToggle = document.getElementById('toggle-edge-labels');
        if (edgeLabelToggle) {
            edgeLabelToggle.addEventListener('change', (e) => {
                cy.style().selector('edge').style('text-opacity', e.target.checked ? 1 : 0).update();
            });
        }

    } catch (error) {
        console.error('Fetch error:', error);
    }
}

// Clustering Logic
const clusterBtn = document.getElementById('run-clustering-btn');
const resetClusterBtn = document.getElementById('reset-clustering-btn');
const algoSelect = document.getElementById('cluster-algo-select');
const algoInfoContent = document.getElementById('algo-info-content'); // Content inside detail
const removeEdgesContainer = document.getElementById('remove-edges-container');
const removeEdgesCheck = document.getElementById('remove-edges-checkbox');

// Descriptions
const algoDescriptions = {
    louvain: "<strong>Louvain:</strong> Optimizes modularity. Best for finding distinct, tightly-knit communities in large networks.",
    greedy_modularity: "<strong>Greedy Modularity:</strong> Merges pairs of communities that increase modularity the most. Good for well-defined structures.",
    spectral: "<strong>Spectral Clustering:</strong> Uses the eigenvalues of the graph Laplacian. Good for identifying clusters with complex shapes (non-convex). Slower on very large graphs.",
    agglomerative: "<strong>Agglomerative:</strong> Bottom-up hierarchical clustering. Pairs nodes based on similarity distances. Good for creating a hierarchy of clusters."
};

// Update info on selection change
if (algoSelect) {
    const updateInfo = () => {
        if (algoInfoContent) algoInfoContent.innerHTML = algoDescriptions[algoSelect.value] || "Select an algorithm.";
    };
    algoSelect.addEventListener('change', updateInfo);
    updateInfo(); // Init
}

// Helper to adjust color brightness
function adjustColor(hex, amount) {
    return '#' + hex.replace(/^#/, '').replace(/../g, color => ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
}

// Generate 3D plastic look shades
function generatePlasticShades(hexColor) {
    // 1. Highlight (Top Left) - Lighter
    // 2. Base (Center) - Normal
    // 3. Shadow (Bottom Right) - Darker
    // We assume hexColor is standard 6-digit hex

    // We need a robust lighten/darken.
    // Since we don't have a library, we do a simple shift.
    // Ensure hex is valid 6 char
    if (hexColor.length === 4) { // #123 -> #112233
        hexColor = '#' + hexColor[1] + hexColor[1] + hexColor[2] + hexColor[2] + hexColor[3] + hexColor[3];
    }

    const highlight = adjustColor(hexColor, 40); // Lighter
    const shadow = adjustColor(hexColor, -40);   // Darker

    return `${highlight} ${hexColor} ${shadow}`;
}

// Color-Blind Safe Palette (Okabe-Ito + extras)
const clusterColors = [
    '#E69F00', // Orange
    '#56B4E9', // Sky Blue
    '#009E73', // Bluish Green
    '#F0E442', // Yellow
    '#0072B2', // Blue
    '#D55E00', // Vermilion
    '#CC79A7', // Reddish Purple
    '#882255', // Dark Red / Magenta
    '#332288', // Indigo
    '#117733', // Dark Green
    '#44AA99', // Teal
    '#999933', // Olive
    '#AA4499'  // Purple
];

// Handle Remove Edges Toggle (Post-Clustering)
if (removeEdgesCheck) {
    removeEdgesCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
            cy.edges().style('opacity', 0);
            cy.edges().style('events', 'no');
        } else {
            cy.edges().removeStyle('opacity');
            cy.edges().removeStyle('events');
        }
    });
}

if (clusterBtn) {
    clusterBtn.addEventListener('click', async () => {
        const algorithm = algoSelect.value;
        const shouldRemoveEdges = removeEdgesCheck ? removeEdgesCheck.checked : false;

        clusterBtn.disabled = true;
        clusterBtn.textContent = 'Running...';

        try {
            const response = await fetch(`/cluster?algorithm=${algorithm}`, { method: 'POST' });
            const clusters = await response.json();

            if (clusters.error) {
                alert(`Error: ${clusters.error}`);
                return;
            }

            // Apply colors and create invisible groups
            cy.batch(() => {
                // CLEANUP: Remove ANY existing cluster groups first to prevent "ghost" repulsion
                cy.nodes().forEach(n => {
                    if (n.isChild()) {
                        const parent = n.parent();
                        if (parent.id().startsWith('cluster_group_')) {
                            n.move({ parent: null });
                        }
                    }
                });
                cy.remove('node[id^="cluster_group_"]');

                // Create parent nodes for each cluster
                const uniqueClusters = new Set(Object.values(clusters));
                uniqueClusters.forEach(clusterId => {
                    const groupId = `cluster_group_${clusterId}`;
                    // We just removed them, so safe to add
                    cy.add({
                        group: 'nodes',
                        data: { id: groupId },
                        style: {
                            'background-opacity': 0,
                            'border-opacity': 0,
                            'text-opacity': 0,
                            'events': 'no' // Let clicks pass through if possible
                        }
                    });
                });

                cy.nodes().forEach(node => {
                    const id = node.id();
                    // Skip our new parents
                    if (id.startsWith('cluster_group_')) return;

                    if (clusters[id] !== undefined) {
                        const clusterId = clusters[id];
                        const color = clusterColors[clusterId % clusterColors.length];

                        // PRESERVE PLASTIC GRADIENT STYLE:
                        const gradientStops = generatePlasticShades(color);

                        node.style('background-fill', 'linear-gradient');
                        node.style('background-gradient-stop-colors', gradientStops);
                        node.style('background-gradient-direction', 'to-bottom-right');

                        // Also update border
                        node.style('border-color', adjustColor(color, -20)); // Slightly darker border

                        // Store for reference
                        node.data('clusterColor', color);

                        // Move to invisible parent group
                        node.move({ parent: `cluster_group_${clusterId}` });
                    }
                });

                // Init edges state if checked
                if (shouldRemoveEdges) {
                    cy.edges().style('opacity', 0);
                    cy.edges().style('events', 'no');
                }
            });

            // Show reset and extra controls IMMEDIATELY (in case layout fails)
            resetClusterBtn.style.display = 'block';
            if (removeEdgesContainer) {
                removeEdgesContainer.style.display = 'block';
            }

            // Run Layout to spatially organize the groups
            // We use 'fcose' - Fast Compound Spring Embedder
            cy.layout({
                name: 'fcose',
                quality: 'proof',
                randomize: false,        // If false, incremental. True for full reset.
                animate: true,
                animationDuration: 1000,
                fit: true,
                padding: 30,
                nodeSeparation: 75,      // Separation between nodes
                idealEdgeLength: 50,     // Ideal edge length
                edgeElasticity: 0.45,
                nestingFactor: 0.1,      // Nesting factor (separation between parent and child)
                gravity: 0.25,           // Gravity to pull disconnected components
                numIter: 2500,
                tilingPaddingVertical: 20,
                tilingPaddingHorizontal: 20,
                initialEnergyOnIncremental: 0.3
            }).run();


        } catch (err) {
            console.error(err);
            alert('Failed to run clustering');
        } finally {
            clusterBtn.disabled = false;
            clusterBtn.textContent = 'Run Clustering';
        }
    });
}

if (resetClusterBtn) {
    resetClusterBtn.addEventListener('click', () => {
        cy.batch(() => {
            // 0. Restore Edges
            cy.edges().removeStyle('opacity');
            cy.edges().removeStyle('events');

            // 1. Remove styles and ungroup
            cy.nodes().forEach(node => {
                if (node.isChild()) {
                    node.move({ parent: null });
                }

                node.removeStyle('background-gradient-stop-colors');
                node.removeStyle('background-fill');
                node.removeStyle('border-color');
            });

            // 2. Remove the group nodes themselves
            cy.nodes('[id^="cluster_group_"]').remove();
        });

        // Hide controls
        resetClusterBtn.style.display = 'none';
        if (removeEdgesContainer) removeEdgesContainer.style.display = 'none';
        if (removeEdgesCheck) removeEdgesCheck.checked = false; // Reset toggle

        // Rerun layout using the EXACT CONFIG from initGraph
        cy.layout({
            name: 'cose',
            animate: true,
            animationDuration: 1000,
            randomize: true,
            padding: 50,
            componentSpacing: 250, // Match init
            nodeRepulsion: (node) => 800000, // Match init
            idealEdgeLength: (edge) => 150, // Match init
            nodeOverlap: 20,
            refresh: 20,
            fit: true,
            gravity: 1
        }).run();
    });
}


// Store active filters
const activeFilters = {
    nodeType: new Set(['bot', 'domain', 'feature_group', 'feature_class', 'feature_subclass', 'ui_element', 'interaction', 'user']),
    ids: new Set() // For specific bot/domain/feature IDs
};

// IDs that have explicit checkboxes (bots, domains, chat features)
const controlledIDs = new Set();

// Lookup maps for efficient filtering
const lookup = {
    botToDomain: new Map(),
    botFeatures: new Map(),
    featureBots: new Map()
};


function generateDynamicFilters(elements) {
    const nodes = elements.nodes.map(n => n.data);
    const edges = elements.edges.map(e => e.data);

    // Build Lookups
    lookup.domainToBots = new Map();

    edges.forEach(e => {
        // Bot -> Domain (partOf)
        if (e.relation === 'partOf') {
            lookup.botToDomain.set(e.source, e.target);
            if (!lookup.domainToBots.has(e.target)) lookup.domainToBots.set(e.target, new Set());
            lookup.domainToBots.get(e.target).add(e.source);
        }
        // Bot -> Feature (hasFeature)
        if (e.relation === 'hasFeature') {
            if (!lookup.botFeatures.has(e.source)) lookup.botFeatures.set(e.source, new Set());
            lookup.botFeatures.get(e.source).add(e.target);

            if (!lookup.featureBots.has(e.target)) lookup.featureBots.set(e.target, new Set());
            lookup.featureBots.get(e.target).add(e.source);
        }
    });

    // 1. Bots
    const bots = nodes.filter(n => n.nodeType === 'bot').map(n => ({ id: n.id, label: n.label }));
    bots.sort((a, b) => a.label.localeCompare(b.label));
    renderFilterGroup('filter-bots', bots, 'id');
    bots.forEach(b => {
        activeFilters.ids.add(b.id);
        controlledIDs.add(b.id);
    });

    // 2. Domains
    const domains = nodes.filter(n => n.nodeType === 'domain').map(n => ({ id: n.id, label: n.label }));
    domains.sort((a, b) => a.label.localeCompare(b.label));
    renderFilterGroup('filter-domains', domains, 'id');
    domains.forEach(d => {
        activeFilters.ids.add(d.id);
        controlledIDs.add(d.id);
    });

    // 3. Feature Categories
    // Helper to find features by parent category ID
    const getFeaturesByCategory = (catId) => {
        const featureIds = edges
            .filter(e => e.target === catId && e.relation === 'category')
            .map(e => e.source);

        // Unique nodes
        const uniqueIds = [...new Set(featureIds)];
        const featureNodes = uniqueIds
            .map(id => nodes.find(n => n.id === id))
            .filter(n => n)
            .map(n => ({ id: n.id, label: n.label }));

        featureNodes.sort((a, b) => a.label.localeCompare(b.label));
        return featureNodes;
    };

    // Chat Features
    const chatFeatures = getFeaturesByCategory('chat_features');
    renderFilterGroup('filter-chat-features', chatFeatures, 'id');
    chatFeatures.forEach(f => { activeFilters.ids.add(f.id); controlledIDs.add(f.id); });

    // UI Features
    const uiFeatures = getFeaturesByCategory('ui_features');
    renderFilterGroup('filter-ui-features', uiFeatures, 'id');
    uiFeatures.forEach(f => { activeFilters.ids.add(f.id); controlledIDs.add(f.id); });

    // Interactive Features
    const intFeatures = getFeaturesByCategory('interactive_features');
    renderFilterGroup('filter-interactive-features', intFeatures, 'id');
    intFeatures.forEach(f => { activeFilters.ids.add(f.id); controlledIDs.add(f.id); });
}

function renderFilterGroup(containerId, items, filterType) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    items.forEach(item => {
        const label = document.createElement('label');
        label.className = 'filter-item';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = true;
        input.dataset.filterType = filterType;
        input.dataset.value = item.id;

        input.addEventListener('change', (e) => {
            updateFilters(e.target.dataset.filterType, e.target.dataset.value, e.target.checked);
        });

        label.appendChild(input);
        label.appendChild(document.createTextNode(item.label));
        container.appendChild(label);
    });
}

function updateFilters(type, value, isChecked) {
    if (type === 'id') {
        if (isChecked) activeFilters.ids.add(value);
        else activeFilters.ids.delete(value);

        // SYNC LOGIC for Multi-Category Items (e.g. Accordion in Chat & UI)
        // Find ALL checkboxes with this value and update them
        const sameValueCheckboxes = document.querySelectorAll(`input[data-value="${value}"]`);
        sameValueCheckboxes.forEach(cb => {
            if (cb.checked !== isChecked) cb.checked = isChecked;
        });

        // Domain Sync Logic
        // If this value is a Domain ID, we need to update all Bots in this domain
        if (lookup.domainToBots && lookup.domainToBots.has(value)) {
            const botIds = lookup.domainToBots.get(value);
            botIds.forEach(botId => {
                // Update internal state
                if (isChecked) activeFilters.ids.add(botId);
                else activeFilters.ids.delete(botId);

                // Update UI Checkboxes for these bots
                const cb = document.querySelector(`input[data-value="${botId}"]`);
                if (cb) cb.checked = isChecked;
            });
        }
    }

    applyFilters();
}

function applyFilters() {
    cy.batch(() => {
        const visibleBots = new Set();

        // 1. Calculate Visible Bots
        // A bot is visible if:
        // - It is checked in 'Bots' filter (activeFilters.ids)
        // - Its Domain is checked in 'Domains' filter (activeFilters.ids)
        // - It has at least ONE feature that is checked in 'Chat Features' (if applicable? User said "only bots having these features")
        //   - Wait, if NO chat features are checked, do we hide all bots? Or just ignore that filter?
        //   - Usually, if a category is partially filtered, we respect it. If ALL features are checked, effectively valid.
        //   - Let's apply intersection logic: Only show bots that have at least one of the *currently active features*.
        //     - But wait, "Feature Classes" are also filtered by nodeType.
        //     - Let's simplify: Check intersection with 'activeFilters.ids' for Chat Features.
        //     - If 'activeFilters.ids' contains ALL chat features, then any bot with a chat feature is fine.
        //     - What if a bot has NO chat features? (e.g. only UI elements). Should it be hidden if we filter "Chat Messages"?
        //     - User said: "If I click on the chat message types, only the bots having these features are shown."
        //     - This implies: If I Enable "Gif", Show Bots with Gif.
        //     - If I Enable "Gif" and "Text", Show Bots with Gif OR Text.
        //     - If I have "Avatar" (uncontrolled), it doesn't help me be visible via Chat Feature filter.
        //     - BUT: If I haven't unchecked ANY chat features, they are ALL active.
        //     - So a bot with "Text" is visible.
        //     - What about a bot with ONLY "Avatar"?
        //     - If "Avatar" is not in controlled IDs, it won't match.
        //     - So that bot would be HIDDEN if we strictly require `hasActiveFeature`.
        //     - Fix: `hasActiveFeature` should be true if:
        //       1. Bot has a feature in `activeFilters.ids`.
        //       2. OR Bot has NO features that are "Controlled" (i.e. it doesn't participate in this filter group).
        //          - This is complex.
        //     - Let's assume for now the User cares about bots that HAVE these chat features. 
        //     - If a bot doesn't have any chat features (e.g. purely menu based?), maybe it should be hidden?
        //     - Or maybe we treat "No Match" as Visible?
        //     - Let's stick to strict: `hasActiveFeature` is required if the bot has *any* potential features.
        //     - If `botFeatures` is empty, easy.
        //     - If `botFeatures` contains only "Avatar", and "Avatar" is NOT controlled... 
        //     - We should probably allow it? 
        //     - For this specific iteration, let's just check intersection with `activeFilters.ids`. 
        //     - If a bot only has features that we aren't filtering, it might disappear. 
        //     - User asked specifically about "Chat Message Types".

        // Let's relax: If a bot has ANY feature `f` such that `controlledIDs.has(f)` is FALSE, we count that as a "match" (pass-through).
        // IF `controlledIDs.has(f)` is TRUE, then we check `activeFilters.ids.has(f)`.

        cy.nodes().forEach(node => {
            const data = node.data();
            if (data.nodeType === 'bot') {
                const isBotChecked = activeFilters.ids.has(data.id);

                const domainId = lookup.botToDomain.get(data.id);
                const isDomainChecked = domainId ? activeFilters.ids.has(domainId) : true; // Default true if no domain?

                // Feature Intersection Check
                // We need to know if this bot has any "Active" features.
                // Which types of features? The user specifically mentioned "Chat Message Types".
                // But logically this should apply to ANY feature filter.
                // However, we only made checkboxes for "Chat Features".
                // So let's check: Does this bot have any feature that is currently in 'activeFilters.ids'?
                // NOTE: 'activeFilters.ids' contains Bot IDs, Domain IDs, and Chat Feature IDs.
                // We need to separate them or just check overlap.

                let hasActiveFeature = false;
                const botFeatures = lookup.botFeatures.get(data.id);
                if (botFeatures) {
                    let matchesFilters = false;
                    let hasControlledFeatures = false;

                    for (let featId of botFeatures) {
                        if (controlledIDs.has(featId)) {
                            hasControlledFeatures = true;
                            if (activeFilters.ids.has(featId)) {
                                matchesFilters = true;
                                break;
                            }
                        }
                    }

                    // If the bot has controlled features (Chat msgs), it MUST match at least one.
                    // If it has NO controlled features (only Avatar), then matchesFilters remains false,
                    // but hasControlledFeatures is false.
                    // If !hasControlledFeatures, we allow it (don't hide based on feature filter).
                    if (!hasControlledFeatures) matchesFilters = true;

                    hasActiveFeature = matchesFilters;
                } else {
                    hasActiveFeature = true; // No features to filter by
                }

                if (isBotChecked && isDomainChecked && hasActiveFeature) {
                    visibleBots.add(data.id);
                    node.style('display', 'element');
                } else {
                    node.style('display', 'none');
                }
            }
        });

        // 2. Visibilty of other nodes (Domains, Features, etc)
        cy.nodes().forEach(node => {
            const data = node.data();
            if (data.nodeType === 'bot') return; // Handled

            // Check Type filter
            if (!activeFilters.nodeType.has(data.nodeType)) {
                node.style('display', 'none');
                return;
            }

            // Domain Visibility
            if (data.nodeType === 'domain') {
                if (activeFilters.ids.has(data.id)) node.style('display', 'element');
                else node.style('display', 'none');
                return;
            }

            // Feature Visibility
            // Is it controlled?
            // If it's a Chat Feature (controlled), it must be in activeFilters.ids
            if (controlledIDs.has(data.id) && !activeFilters.ids.has(data.id)) {
                node.style('display', 'none');
                return;
            }

            // AND: It must be connected to at least one VISIBLE Bot?
            // "only the bot with its features is shown".
            // If I hide all bots, features should assume hidden?
            // Check connected bots
            const connectedBots = lookup.featureBots.get(data.id);
            if (connectedBots) {
                let connectedToVisible = false;
                for (let botId of connectedBots) {
                    if (visibleBots.has(botId)) {
                        connectedToVisible = true;
                        break;
                    }
                }
                if (connectedToVisible) node.style('display', 'element');
                else node.style('display', 'none');
            } else {
                // Standalone feature? Show it (e.g. Parent type or Group)
                node.style('display', 'element');
            }
        });
    });
}


function showDetails(data) {
    const panel = document.getElementById('details-panel');
    const content = document.getElementById('details-content');
    const selectorContainer = document.getElementById('bot-selector-container');
    const selector = document.getElementById('bot-selector');
    const screenshotContainer = document.getElementById('screenshot-container');
    const screenshotImg = document.getElementById('feature-screenshot');

    // Reset screenshot UI
    selectorContainer.classList.add('hidden');
    screenshotContainer.classList.add('hidden');
    selector.innerHTML = '<option value="">Select a Bot...</option>';
    screenshotImg.src = '';

    // Show Details
    content.innerHTML = Object.entries(data)
        .filter(([key, value]) => key !== 'screenshots' && value !== '')
        .map(([key, value]) => `
            <div class="detail-item">
                <div class="detail-label">${key.replace(/_/g, ' ')}</div>
                <div class="detail-value">${value}</div>
            </div>
        `).join('');

    // Dynamic Bot Selection: Find bots connected to this node
    // Use the cy instance to traverse
    const cyNode = cy.getElementById(data.id);
    if (cyNode && cyNode.id()) {
        // Find sources of incoming edges where source is a bot
        const connectedBots = cyNode.incomers('edge')
            .filter(edge => {
                const source = edge.source();
                return source.data('nodeType') === 'bot';
            })
            .map(edge => edge.source());

        if (connectedBots.length > 0) {
            selectorContainer.classList.remove('hidden');

            // Sort bots alphabetically
            connectedBots.sort((a, b) => a.data('label').localeCompare(b.data('label')));

            connectedBots.forEach(bot => {
                const botId = bot.id();
                const option = document.createElement('option');
                option.value = botId; // Store ID as value
                option.textContent = bot.data('label');
                selector.appendChild(option);
            });

            // Handle Selection
            selector.onchange = (e) => {
                const botId = e.target.value;
                if (botId) {


                    const hasScreenshot = data.screenshots && data.screenshots[botId];
                    if (hasScreenshot) {
                        screenshotImg.src = data.screenshots[botId];
                        screenshotImg.style.display = 'block';
                        // Add 'placeholder' handling if needed
                    } else {
                        // Show placeholder or hide image
                        // Let's use a placeholder image or clear src
                        screenshotImg.src = ''; // Or a "no-image.png"
                        screenshotImg.alt = `No screenshot available for ${botId}`;
                    }
                    screenshotContainer.classList.remove('hidden');
                } else {
                    screenshotContainer.classList.add('hidden');
                }
            };
        }
    }

    panel.classList.remove('hidden');
}

function hideDetails() {
    document.getElementById('details-panel').classList.add('hidden');
    document.getElementById('bot-selector-container').classList.add('hidden');
    document.getElementById('screenshot-container').classList.add('hidden');
}

// Sidebar Toggle
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');

sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    sidebarToggle.innerText = sidebar.classList.contains('collapsed') ? '❯' : '❮';
});

document.getElementById('close-details').addEventListener('click', hideDetails);

// Start
initGraph();

// --- Bot Walkthrough Feature ---
const walkthroughSelect = document.getElementById('walkthrough-bot-select');
const startWalkthroughBtn = document.getElementById('start-walkthrough-btn');
const resetWalkthroughBtn = document.getElementById('reset-walkthrough-btn');

function initWalkthroughUI(elements) {
    if (!walkthroughSelect) return;

    // Check if we already have options
    if (walkthroughSelect.options.length > 1) return;

    const bots = elements.nodes.filter(n => n.data.nodeType === 'bot')
        .map(n => ({ id: n.data.id, label: n.data.label }));
    bots.sort((a, b) => a.label.localeCompare(b.label));

    // Clear and Populate Dropdown
    walkthroughSelect.innerHTML = '<option value="">Select a bot to start...</option>';
    bots.forEach(bot => {
        const option = document.createElement('option');
        option.value = bot.id;
        option.textContent = bot.label;
        walkthroughSelect.appendChild(option);
    });
}


if (startWalkthroughBtn) {
    startWalkthroughBtn.addEventListener('click', () => {
        const botId = walkthroughSelect.value;

        if (!botId) {
            alert('Please select a bot from the dropdown.');
            return;
        }

        // UI Updates
        startWalkthroughBtn.style.display = 'none';
        resetWalkthroughBtn.style.display = 'block';
        if (walkthroughSelect) walkthroughSelect.disabled = true;

        const botIds = [botId];

        const rootBot = cy.getElementById(botIds[0]);

        // 1. "Empty at first": Hide EVERYTHING
        cy.elements().addClass('dimmed').style('opacity', 0);

        // 2. Identify the Tree to Reveal (BFS Traversal)
        // We want to verify we only show connected nodes, avoiding other bots.

        const layers = []; // Array of arrays (generations)
        const visited = new Set();

        // Layer 0: The Bot
        layers.push([rootBot]);
        visited.add(rootBot.id());

        // Perform BFS to build layers
        let currentLayer = [rootBot];

        // We'll go e.g. 3 levels deep or until exhaustion
        for (let i = 0; i < 3; i++) {
            const nextLayer = [];
            currentLayer.forEach(node => {
                const outgoers = node.outgoers();
                outgoers.forEach(ele => {
                    if (!visited.has(ele.id())) {
                        // Filter: Don't traverse into other BOTS
                        if (ele.isNode() && ele.data('nodeType') === 'bot') return;

                        visited.add(ele.id());
                        nextLayer.push(ele);
                    }
                });
            });
            if (nextLayer.length === 0) break;
            layers.push(nextLayer);
            currentLayer = nextLayer.filter(ele => ele.isNode());
        }

        // 3. Highlight Subgraph & Zoom
        const allInWalkthrough = cy.collection();
        layers.forEach(layer => layer.forEach(ele => allInWalkthrough.merge(ele)));

        // Bring them to "highlighted" class state but keep opacity 0 for animation
        allInWalkthrough.removeClass('dimmed').addClass('walkthrough-highlight');

        // 4. ANIMATION SEQUENCE
        // Iterate layers
        let delay = 0;

        layers.forEach((layer, index) => {
            setTimeout(() => {
                layer.forEach(ele => {
                    ele.style('opacity', 1);
                    if (ele.isNode()) {
                        // Pop effect for nodes
                        ele.animation({
                            style: { 'width': ele.width() * 1.2, 'height': ele.height() * 1.2 },
                            duration: 300
                        }).play().promise('complete').then(() => {
                            ele.animation({
                                style: { 'width': ele.width() / 1.2, 'height': ele.height() / 1.2 },
                                duration: 300
                            }).play();
                        });
                    }
                });
            }, delay);

            // Dynamic Timing Logic:
            // - After Bot (Layer 0): Short wait (2s)
            // - After deeper layers: Long wait (6s)
            if (index === 0) {
                delay += 2000;
            } else {
                delay += 6000;
            }
        });

        // 5. Fit View to Subgraph
        cy.animate({
            fit: {
                eles: allInWalkthrough,
                padding: 100
            },
            duration: 1500,
            easing: 'ease-out-cubic'
        });
    });
}

if (resetWalkthroughBtn) {
    resetWalkthroughBtn.addEventListener('click', () => {
        startWalkthroughBtn.style.display = 'block';
        resetWalkthroughBtn.style.display = 'none';
        if (walkthroughSelect) walkthroughSelect.disabled = false;

        // Restore All
        cy.elements().removeClass('dimmed walkthrough-highlight');
        cy.elements().removeStyle('opacity width height');

        // Clean up edge opacity specifically if it was set
        cy.edges().removeStyle('opacity');

        cy.fit();
    });
}