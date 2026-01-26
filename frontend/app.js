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




let currentlySelectedNodeId = null;

async function initGraph() {
    try {
        const response = await fetch('/graph?v=' + new Date().getTime());
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

        cy.on('tap', 'node', (evt) => {
            const node = evt.target;

            // 🔥 IMPORTANT: set selected node FIRST
            currentlySelectedNodeId = node.id();

            // Clear old UI state
            clearDetailsUI();

            // Now show new node details
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
        // --- AUTO-REFRESH BOT SELECTOR WHEN GRAPH CHANGES (SAFE + DEBOUNCED) ---

        let refreshTimeout = null;

        function refreshDetailsIfNeeded() {
            if (!currentlySelectedNodeId) return;
            if (!cy) return;

            const node = cy.getElementById(currentlySelectedNodeId);

            // If node no longer exists or not visible → close panel
            if (!node || !node.id() || !node.visible()) {
                hideDetails();
                return;
            }

            // Otherwise refresh selector + screenshot
            updateBotSelector(currentlySelectedNodeId);
        }

        // Debounced wrapper (prevents flicker / spam)
        function scheduleRefresh() {
            if (refreshTimeout) clearTimeout(refreshTimeout);
            refreshTimeout = setTimeout(() => {
                refreshDetailsIfNeeded();
            }, 50); // 50ms is plenty
        }

        // Structural or data changes (new bots, edges, screenshots added)
        cy.on('add remove data', 'node, edge', () => {
            scheduleRefresh();
        });

        // Visibility / filter changes (style updates)
        cy.on('style', 'node', () => {
            scheduleRefresh();
        });

        // After layouts finish (important after clustering / relayout)
        cy.on('layoutstop', () => {
            scheduleRefresh();
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
    if (currentlySelectedNodeId) {
        updateBotSelector(currentlySelectedNodeId);
    }
}

function applyFilters() {
    cy.batch(() => {
        const visibleBots = new Set();

        cy.nodes().forEach(node => {
            const data = node.data();
            if (data.nodeType === 'bot') {
                const isBotChecked = activeFilters.ids.has(data.id);

                const domainId = lookup.botToDomain.get(data.id);
                const isDomainChecked = domainId ? activeFilters.ids.has(domainId) : true; // Default true if no domain?


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
                // Check if any INCOMING 'partOf' edge comes from a VISIBLE bot
                const connectedBots = node.incomers('edge[relation="partOf"]').sources();
                const hasVisibleChild = connectedBots.some(b => visibleBots.has(b.id()));

                // Show logic: Must be checked AND have visible children (or be manually checked while children are hidden? User wants clean view)
                // If I uncheck all bots, visibleBots is empty -> hasVisibleChild false -> Hide Domain.
                if (activeFilters.ids.has(data.id) && (connectedBots.length === 0 || hasVisibleChild)) {
                    node.style('display', 'element');
                } else {
                    node.style('display', 'none');
                }
                return;
            }

            // Feature Visibility
            if (controlledIDs.has(data.id) && !activeFilters.ids.has(data.id)) {
                node.style('display', 'none');
                return;
            }
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
                // Standalone feature? 
                // Specific check for Feature Groups (e.g. Chat Features)
                if (data.nodeType === 'feature_group') {
                    // Check if any INCOMING 'category' edge comes from a VISIBLE node
                    // Note: In graph, Features -> category -> FeatureGroup.
                    const connectedFeatures = node.incomers('edge[relation="category"]').sources();
                    // A feature is visible if it is NOT hidden (style display !== none)
                    // We can't easily check style here inside the batch/loop effectively if order matters,
                    // but we can check if it WOULD be visible.
                    // Simplified: Check if any connected feature has a visible provider bot.

                    const hasVisibleChild = connectedFeatures.some(f => {
                        // Is feature 'f' visible?
                        // f is visible if: 
                        // 1. !controlled or activeFilters includes it
                        // 2. AND it has a visible bot provider

                        const fData = f.data();
                        // Filter check
                        if (controlledIDs.has(fData.id) && !activeFilters.ids.has(fData.id)) return false;

                        // Bot provider check
                        const fProviders = lookup.featureBots.get(fData.id);
                        if (!fProviders) return true; // Standalone feature?

                        for (let botId of fProviders) {
                            if (visibleBots.has(botId)) return true;
                        }
                        return false;
                    });

                    if (hasVisibleChild) node.style('display', 'element');
                    else node.style('display', 'none');
                } else {
                    node.style('display', 'element');
                }
            }
        });
    });
}


function showDetails(data) {
    const panel = document.getElementById('details-panel');
    const content = document.getElementById('details-content');
    const title = document.getElementById('details-title');

    // Update Title from "Node Details" to selected Node Label
    if (title) {
        title.innerText = data.label || 'Node Details';
    }

    // Reset screenshot UI (using centralized helper)
    clearDetailsUI();

    let html = '';

    // --- ALWAYS render description first if the field exists ---
    if ('description' in data) {
        const desc = data.description && data.description.trim() !== ''
            ? data.description
            : '<span style="color:#94a3b8;font-style:italic;">No description available</span>';

        html += `
            <div class="detail-item detail-description">
                <div class="detail-label">Description</div>
                <div class="detail-value">${desc}</div>
            </div>
        `;
    }

    // --- Render all other fields except screenshots + description ---
    html += Object.entries(data)
        .filter(([key]) => key !== 'screenshots' && key !== 'description')
        .map(([key, value]) => {
            if (value === '' || value === null || value === undefined) return '';

            return `
                <div class="detail-item">
                    <div class="detail-label">${key.replace(/_/g, ' ')}</div>
                    <div class="detail-value">${value}</div>
                </div>
            `;
        }).join('');

    content.innerHTML = html;

    // Dynamic Bot Selection
    currentlySelectedNodeId = data.id;
    updateBotSelector(data.id);

    // Show panel
    panel.classList.remove('hidden');
}



// Helper to manage screenshot state
let currentScreenshotIndex = 0;
let currentScreenshots = [];

function updateBotSelector(nodeId) {
    const selectorContainer = document.getElementById('bot-selector-container');
    const selector = document.getElementById('bot-selector');
    const screenshotContainer = document.getElementById('screenshot-container');
    const screenshotImg = document.getElementById('feature-screenshot');
    const nextBtn = document.getElementById('screenshot-next-btn');
    const prevBtn = document.getElementById('screenshot-prev-btn');

    if (!cy || !nodeId) {
        clearDetailsUI();
        return;
    }

    const cyNode = cy.getElementById(nodeId);
    if (!cyNode || !cyNode.id()) return;

    const data = cyNode.data();

    // Node has no screenshots → force-hide everything
    if (!data.screenshots || Object.keys(data.screenshots).length === 0) {
        clearDetailsUI();
        return;
    }

    // Find connected bots (incoming edges from bots)
    const connectedBots = cyNode.incomers('edge')
        .filter(edge => edge.source().data('nodeType') === 'bot')
        .map(edge => edge.source());

    if (connectedBots.length === 0) {
        clearDetailsUI();
        return;
    }

    // Keep ONLY bots that:
    // 1. Are visible (pass left filters)
    // 2. Have a screenshot for this node
    const eligibleBots = connectedBots.filter(bot => {
        const botId = bot.id();
        return bot.visible() && data.screenshots[botId];
    });

    // No valid bots → keep UI hidden
    if (eligibleBots.length === 0) {
        clearDetailsUI();
        return;
    }

    // --- SHOW SELECTOR ---
    selectorContainer.classList.remove('hidden');

    // Sort alphabetically
    eligibleBots.sort((a, b) => a.data('label').localeCompare(b.data('label')));

    // Capture current selection to restore if possible
    const previousSelection = selector.value;

    // Clear existing options to prevent duplication
    selector.innerHTML = '';

    // Populate dropdown
    const addedBotIds = new Set();
    eligibleBots.forEach(bot => {
        const botId = bot.id();
        if (addedBotIds.has(botId)) return; // Skip duplicates
        addedBotIds.add(botId);

        const option = document.createElement('option');
        option.value = botId;
        option.textContent = bot.data('label');
        selector.appendChild(option);
    });

    // Restore selection if valid, otherwise select first
    if (previousSelection && addedBotIds.has(previousSelection)) {
        selector.value = previousSelection;
    } else {
        selector.value = eligibleBots[0].id();
    }

    // Function to render current screenshot state
    const renderScreenshotState = (botId) => {
        const ssData = data.screenshots[botId];

        // Reset state
        currentScreenshotIndex = 0;
        currentScreenshots = [];

        if (Array.isArray(ssData)) {
            currentScreenshots = ssData;
        } else {
            currentScreenshots = [ssData];
        }

        // Show first image
        if (currentScreenshots.length > 0) {
            // Fix path if it's relative and missing assets/
            let src = currentScreenshots[0];
            if (!src.startsWith('assets/') && !src.startsWith('http')) {
                src = 'assets/screenshots/' + src;
            }
            screenshotImg.src = src;

            screenshotContainer.classList.remove('hidden');
        } else {
            screenshotImg.src = '';
            screenshotContainer.classList.add('hidden');
        }

        // Toggle Buttons
        if (currentScreenshots.length > 1) {
            nextBtn.classList.remove('hidden');
            prevBtn.classList.remove('hidden');
        } else {
            nextBtn.classList.add('hidden');
            prevBtn.classList.add('hidden');
        }
    };

    // Initialize view
    renderScreenshotState(selector.value);

    // Handle user changing bot
    selector.onchange = (e) => {
        const botId = e.target.value;
        renderScreenshotState(botId);
    };

    // Click Handlers
    nextBtn.onclick = () => {
        if (currentScreenshots.length <= 1) return;
        currentScreenshotIndex = (currentScreenshotIndex + 1) % currentScreenshots.length;

        let src = currentScreenshots[currentScreenshotIndex];
        if (!src.startsWith('assets/') && !src.startsWith('http')) src = 'assets/screenshots/' + src;
        screenshotImg.src = src;
    };

    prevBtn.onclick = () => {
        if (currentScreenshots.length <= 1) return;
        // Wrap around logic: (index - 1 + length) % length
        currentScreenshotIndex = (currentScreenshotIndex - 1 + currentScreenshots.length) % currentScreenshots.length;

        let src = currentScreenshots[currentScreenshotIndex];
        if (!src.startsWith('assets/') && !src.startsWith('http')) src = 'assets/screenshots/' + src;
        screenshotImg.src = src;
    };
}


function hideDetails() {
    currentlySelectedNodeId = null;
    document.getElementById('details-panel').classList.add('hidden');
    clearDetailsUI();
}

/**
 * Centralized function to clear screenshot and selector UI
 */
function clearDetailsUI() {
    const selectorContainer = document.getElementById('bot-selector-container');
    const selector = document.getElementById('bot-selector');
    const screenshotContainer = document.getElementById('screenshot-container');
    const screenshotImg = document.getElementById('feature-screenshot');
    const nextBtn = document.getElementById('screenshot-next-btn');
    const prevBtn = document.getElementById('screenshot-prev-btn');

    if (selectorContainer) selectorContainer.classList.add('hidden');
    if (screenshotContainer) screenshotContainer.classList.add('hidden');
    if (nextBtn) nextBtn.classList.add('hidden');
    if (prevBtn) prevBtn.classList.add('hidden');

    if (selector) selector.innerHTML = '<option value="">Select a Bot...</option>';

    if (screenshotImg) {
        screenshotImg.src = '';
        screenshotImg.removeAttribute('src'); // Ensure it's really gone
    }

    currentScreenshots = [];
    currentScreenshotIndex = 0;
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