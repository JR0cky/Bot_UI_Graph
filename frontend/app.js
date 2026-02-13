let cy;

// Helper to generate shades (defined early for use in colors)
function adjustColor(hex, amount) {
    if (!hex) return '#999999';
    return '#' + hex.replace(/^#/, '').replace(/../g, color => ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
}

const colors = {
    // Accessible Okabe-Ito Palette for Distinct Node Types
    // https://jfly.uni-koeln.de/color/

    // Bot: Vermilion (Action/Agent) -> #D55E00
    bot: ['#E37640', '#D55E00', '#A34600'],

    // Domain: Bluish Green (Structure/Area) -> #009E73
    domain: ['#33C297', '#009E73', '#00664A'],

    // User: Sky Blue (Friendly/Distinct) -> #56B4E9
    user: ['#8ACDF2', '#56B4E9', '#3080B0'],

    // Feature Group: Grey (Neutral) -> #999999
    feature_group: ['#BBBBBB', '#999999', '#666666'],
    feature: ['#BBBBBB', '#999999', '#666666'], // Default

    // --- Hardcoded Feature Groups (Data-Driven) ---

    // Chat Content -> Orange (#E69F00)
    'chat__content': ['#F0B940', '#E69F00', '#B57D00'],

    // System Features -> Reddish Purple (#CC79A7) - Replaces "Pink"
    'system_features': ['#DD94BE', '#CC79A7', '#99597B'],

    // Extended Interactions -> Blue (#0072B2) - Distinct from Sky Blue
    'extended_interactions': ['#4DA3E6', '#0072B2', '#004D80'],

    // Meta Conversation -> Yellow (#F0E442) - High visibility
    'meta_conversation': ['#F9EF85', '#F0E442', '#BDB115'],

    // Fallback: Dark Grey
    unknown: ['#777777', '#555555', '#333333']
};

let currentlySelectedNodeId = null;
let currentScreenshotIndex = 0;
let currentScreenshots = [];

// Helper to get group color safely
function getGroupColor(gid) {
    if (colors[gid]) return colors[gid][1]; // Return middle shade
    return '#999999';
}

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
                        'font-size': '12px',
                        'font-weight': '600',
                        'text-valign': 'center',
                        'text-margin-y': '35px',
                        'width': 45,
                        'height': 45,
                        'transition-property': 'background-color, line-color, target-arrow-color, width, height, opacity',
                        'transition-duration': '0.3s',
                        'background-fill': 'linear-gradient',
                        'background-gradient-stop-colors': (node) => {
                            const data = node.data();
                            const type = data.nodeType;

                            // 1. Check if node ID matches a known color group (e.g. feature groups)
                            if (colors[data.id]) {
                                const c = colors[data.id];
                                return `${c[0]} ${c[1]} ${c[2]}`;
                            }

                            // 2. Check if node has a groupId that matches a known color group (Feature -> Group)
                            if (data.groupId && colors[data.groupId]) {
                                const c = colors[data.groupId];
                                return `${c[0]} ${c[1]} ${c[2]}`;
                            }

                            // 3. Fallback to Type
                            const c = colors[type] || colors.unknown;
                            return `${c[0]} ${c[1]} ${c[2]}`;
                        },
                        'background-gradient-stop-positions': '0% 50% 100%',
                        'background-gradient-direction': 'to-bottom-right',
                        'border-width': 0, // Default no border
                        'border-color': (node) => {
                            const data = node.data();
                            // Optional: Add border for clarity
                            if (data.nodeType === 'feature') return 'white';
                            return '#666';
                        },
                        'shadow-blur': 8,
                        'shadow-color': 'rgba(0,0,0,0.15)',
                        'shadow-offset-y': 3
                    }
                },
                {
                    selector: 'node[nodeType="feature"]',
                    style: {
                        'border-width': 2,
                        'border-color': 'white'
                    }
                },
                {
                    selector: 'node[nodeType="bot"]',
                    style: {
                        'width': 75,
                        'height': 75,
                        'font-size': '14px',
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
                        'font-size': '11px',
                        'text-background-opacity': 1,
                        'text-background-color': '#f8fafc',
                        'text-background-padding': '3px',
                        'text-background-shape': 'roundrectangle',
                        'edge-text-rotation': 'autorotate',
                        'text-margin-y': '0px',
                        'text-opacity': 1
                    }
                },
                {
                    selector: '.clustered-border',
                    style: {
                        'border-width': 1, // Thinner static border
                        'border-color': '#000000',
                        'border-style': 'solid'
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
                },
                {
                    selector: '.clustered-border.highlighted',
                    style: {
                        'border-width': 3, // Thinner hover border
                        'border-color': '#000000'
                    }
                }
            ],
            layout: {
                name: 'cose',
                animate: true,
                animationDuration: 1000,
                randomize: true,
                padding: 50,
                componentSpacing: 250,
                nodeRepulsion: (node) => 800000,
                idealEdgeLength: (edge) => 150,
                nodeOverlap: 20,
                refresh: 20,
                fit: true,
                gravity: 1
            }
        });

        window.cy = cy; // Expose for debugging/automation

        // Event Handling
        cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            currentlySelectedNodeId = node.id();
            showDetails(node.data());
        });

        cy.on('tap', function (evt) {
            if (evt.target === cy) {
                hideDetails();
            }
        });

        // Hover Highlighting
        cy.on('mouseover', 'node', (e) => {
            // Rule 1: Disable hover effect if edges are hidden (Global Rule)
            const edgesToggle = document.getElementById('toggle-show-edges-main');
            if (edgesToggle && !edgesToggle.checked) return;

            const node = e.target;

            // Ignore if hovering over an invisible cluster group parent
            if (node.id().startsWith('cluster_group_')) return;

            cy.batch(() => {
                // Fade everything EXCEPT cluster groups (to prevent simple grey rectangles)
                cy.elements().not('[id^="cluster_group_"]').addClass('faded');

                // Highlight neighborhood
                const neighborhood = node.neighborhood().add(node);
                neighborhood.not('[id^="cluster_group_"]').removeClass('faded').addClass('highlighted');
            });
        });

        cy.on('mouseout', 'node', (e) => {
            // Rule 1 check not strictly needed for reset, but safe
            const edgesToggle = document.getElementById('toggle-show-edges-main');
            if (edgesToggle && !edgesToggle.checked) return;

            // Remove classes from everything
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
        // initWalkthroughUI(elements); // Removed
        initTutorial(); // New Tutorial
        initDisplayToggles(); // New Toggles
        applyFilters();

    } catch (error) {
        console.error('Fetch error:', error);
    }
}



// --- Clustering Logic ---

const clusterBtn = document.getElementById('run-clustering-btn');
const resetClusterBtn = document.getElementById('reset-clustering-btn');
const algoSelect = document.getElementById('cluster-algo-select');
const algoInfoContent = document.getElementById('algo-info-content');

// Descriptions
const algoDescriptions = {
    domain: "<strong>Domain:</strong> Groups nodes strictly by the Domain structure relative to Bots. Features are assigned to the Domain with the most connected Bots.",
    agglomerative: "<strong>Bot Types (Agglomerative):</strong> Groups bots by feature similarity. Reveals hidden structures like 'Generalist LLMs' vs 'Specialized Tools' (Data-Driven)."
};

// Update info on selection change
if (algoSelect) {
    const updateInfo = () => {
        if (algoInfoContent) {
            algoInfoContent.innerHTML = algoDescriptions[algoSelect.value] || "Select an algorithm.";
        }
    };
    algoSelect.addEventListener('change', updateInfo);
    // Init on load
    updateInfo();
}

// Helper to adjust color brightness
function adjustColor(hex, amount) {
    if (!hex) return '#999999';
    return '#' + hex.replace(/^#/, '').replace(/../g, color => ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
}

// Generate 3D plastic look shades
function generatePlasticShades(hexColor) {
    if (!hexColor) return '#999999 #999999 #999999';
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


if (clusterBtn) {
    clusterBtn.addEventListener('click', async () => {
        const algorithm = algoSelect.value;
        // const shouldRemoveEdges = removeEdgesCheck ? removeEdgesCheck.checked : false; // REMOVED

        clusterBtn.disabled = true;
        clusterBtn.textContent = 'Running...';

        try {
            const response = await fetch(`/cluster?algorithm=${algorithm}`, { method: 'POST' });
            const clusters = await response.json();

            if (clusters.error) {
                alert(`Error: ${clusters.error}`);
                return;
            }

            // HIDE UI Sections
            // 1. Hide entire filters container (Includes Title + Subsections)
            const allFilters = document.getElementById('all-filters-container');
            if (allFilters) allFilters.style.display = 'none';

            // 2. Hide Walkthrough Section
            const wtSection = document.getElementById('walkthrough-section');
            if (wtSection) wtSection.style.display = 'none';


            const sidebarContent = document.querySelector('.sidebar-content');
            if (sidebarContent) sidebarContent.classList.add('clustering-active');


            // Apply colors and create invisible groups
            cy.batch(() => {
                // CLEANUP existing
                cy.nodes().forEach(n => {
                    if (n.isChild()) {
                        n.move({ parent: null });
                    }
                });
                cy.remove('node[id^="cluster_group_"]');

                // Create parent nodes
                const uniqueClusters = new Set(Object.values(clusters));
                uniqueClusters.forEach(clusterId => {
                    const groupId = `cluster_group_${clusterId}`;
                    cy.add({
                        group: 'nodes',
                        data: { id: groupId },
                        style: {
                            'background-opacity': 0, 'border-opacity': 0, 'text-opacity': 0, 'events': 'no'
                        }
                    });
                });

                cy.nodes().forEach(node => {
                    const id = node.id();
                    if (id.startsWith('cluster_group_')) return;

                    if (clusters[id] !== undefined) {
                        const clusterId = clusters[id];
                        const color = clusterColors[clusterId % clusterColors.length];

                        // PRESERVE PLASTIC GRADIENT STYLE
                        const gradientStops = generatePlasticShades(color);

                        node.style('background-fill', 'linear-gradient');
                        node.style('background-gradient-stop-colors', gradientStops);
                        node.style('background-gradient-direction', 'to-bottom-right');

                        // Border - Standard
                        node.style('border-color', adjustColor(color, -20));
                        node.style('border-width', 0); // Reset width first

                        node.data('clusterColor', color);
                        node.move({ parent: `cluster_group_${clusterId}` });
                    }
                });

                // --- ADD DARK BORDER TO BOTS & DOMAINS (Clustering Mode) ---
                const specializedNodes = cy.nodes('[nodeType="bot"], [nodeType="domain"]');
                specializedNodes.removeStyle('border-width'); // Clear inline override so class works
                specializedNodes.removeStyle('border-color'); // Clear inline override
                specializedNodes.addClass('clustered-border');
            });

            // Show reset
            resetClusterBtn.style.display = 'block';

            // Layout
            cy.layout({
                name: 'fcose', quality: 'proof', randomize: false, animate: true, animationDuration: 1000,
                fit: true, padding: 30, nodeSeparation: 75, idealEdgeLength: 50, edgeElasticity: 0.45, nestingFactor: 0.1,
                gravity: 0.25, numIter: 2500, tilingPaddingVertical: 20, tilingPaddingHorizontal: 20, initialEnergyOnIncremental: 0.3
            }).run();


        } catch (err) {
            console.error(err);
            alert('Failed to run clustering');
            clusterBtn.disabled = false;
            clusterBtn.textContent = 'Run Clustering';
        } finally {
            if (clusterBtn.textContent === 'Running...') {
                clusterBtn.disabled = false;
                clusterBtn.textContent = 'Run Clustering';
            }
        }
    });
}

if (resetClusterBtn) {
    resetClusterBtn.addEventListener('click', () => {
        cy.batch(() => {
            // Restore Edges
            cy.edges().removeStyle('opacity');
            cy.edges().removeStyle('events');

            // Restore Nodes
            cy.nodes().forEach(node => {
                if (node.isChild()) node.move({ parent: null });

                node.removeStyle('background-gradient-stop-colors');
                node.removeStyle('background-fill');
                node.removeStyle('border-color');
                node.removeStyle('border-width'); // Remove clustering borders
                node.removeStyle('border-style');
                node.removeClass('clustered-border'); // Remove class
            });

            // Remove groups
            cy.nodes('[id^="cluster_group_"]').remove();
        });

        // Restore UI Visibility
        // 1. Filters Container
        const allFilters = document.getElementById('all-filters-container');
        if (allFilters) allFilters.style.display = '';

        // 2. Walkthrough
        const wtSection = document.getElementById('walkthrough-section');
        if (wtSection) wtSection.style.display = '';

        const sidebarContent = document.querySelector('.sidebar-content');
        if (sidebarContent) sidebarContent.classList.remove('clustering-active');

        // Hide controls
        resetClusterBtn.style.display = 'none';

        // Rerun Layout based on updated constraints (if filters changed)
        // We use 'cose' for main view
        cy.layout({
            name: 'cose', animate: true, animationDuration: 1000, randomize: true, padding: 50, componentSpacing: 400,
            nodeRepulsion: (node) => 2000000, idealEdgeLength: (edge) => 250, nodeOverlap: 20, refresh: 20, fit: true, gravity: 1
        }).run();
    });
}

// --- Filters Logic (Corrected for New Data) ---

const activeFilters = {
    nodeType: new Set(['bot', 'domain', 'feature_group', 'feature', 'user']),
    ids: new Set()
};

const controlledIDs = new Set();
// Lookups
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
    lookup.botToDomain = new Map();
    lookup.botFeatures = new Map();
    lookup.featureBots = new Map();

    edges.forEach(e => {
        // Bot -> Domain (partOf)
        if (e.relation === 'partOf' && nodes.find(n => n.id === e.source && n.nodeType === 'bot')) {
            lookup.botToDomain.set(e.source, e.target);
            if (!lookup.domainToBots.has(e.target)) lookup.domainToBots.set(e.target, new Set());
            lookup.domainToBots.get(e.target).add(e.source);
        }
        // Bot -> Feature (hasFeature)
        if (e.relation === 'hasFeature') {
            // Source is Bot, Target is Feature
            if (!lookup.botFeatures.has(e.source)) lookup.botFeatures.set(e.source, new Set());
            lookup.botFeatures.get(e.source).add(e.target);

            if (!lookup.featureBots.has(e.target)) lookup.featureBots.set(e.target, new Set());
            lookup.featureBots.get(e.target).add(e.source);
        }
    });

    // 1. Bots
    const bots = nodes.filter(n => n.nodeType === 'bot').map(n => ({ id: n.id, label: n.label, nodeType: 'bot' }));
    bots.sort((a, b) => a.label.localeCompare(b.label));
    renderFilterGroup('filter-bots', bots, 'id');
    bots.forEach(b => { activeFilters.ids.add(b.id); controlledIDs.add(b.id); });

    // 2. Domains
    const domains = nodes.filter(n => n.nodeType === 'domain').map(n => ({ id: n.id, label: n.label, nodeType: 'domain' }));
    domains.sort((a, b) => a.label.localeCompare(b.label));
    renderFilterGroup('filter-domains', domains, 'id');
    domains.forEach(d => { activeFilters.ids.add(d.id); controlledIDs.add(d.id); });

    // 3. Feature Groups (Hardcoded map based on static_graph.json to match user preference slots)

    // Helper to get features for a group
    // RELATION IS 'partOf'. Source = Feature, Target = Group.
    const getFeaturesByGroup = (groupId) => {
        const featureIds = edges
            .filter(e => e.target === groupId && e.relation === 'partOf')
            .map(e => e.source);

        const uniqueIds = [...new Set(featureIds)];
        const featureNodes = uniqueIds
            .map(id => nodes.find(n => n.id === id))
            .filter(n => n)
            .map(n => ({
                id: n.id,
                label: n.label,
                nodeType: 'feature',
                color: getGroupColor(groupId) // Pass group color
            }));
        featureNodes.sort((a, b) => a.label.localeCompare(b.label));
        return featureNodes;
    };

    // --- Category Toggles ---
    document.querySelectorAll('.category-toggle').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const targetId = e.target.dataset.target;
            const isChecked = e.target.checked;
            const container = document.getElementById(targetId);

            if (container) {
                // 1. Toggle all child inputs visually and update state
                container.querySelectorAll('input[type="checkbox"]').forEach(input => {
                    input.checked = isChecked;
                    const val = input.dataset.value;
                    const type = input.dataset.filterType;
                    // Proactively update the activeFilters set
                    if (type === 'id') {
                        if (isChecked) activeFilters.ids.add(val);
                        else activeFilters.ids.delete(val);
                    }
                });

                // 2. Re-apply graph filters
                applyFilters();
            }
        });
    });

    // Chat Content
    const chatFeatures = getFeaturesByGroup('chat__content');
    renderFilterGroup('filter-chat-features', chatFeatures, 'id');
    chatFeatures.forEach(f => { activeFilters.ids.add(f.id); controlledIDs.add(f.id); });

    // System Features (Mapped to UI slot)
    const sysFeatures = getFeaturesByGroup('system_features');
    renderFilterGroup('filter-ui-features', sysFeatures, 'id');
    sysFeatures.forEach(f => { activeFilters.ids.add(f.id); controlledIDs.add(f.id); });

    // Interactive / Extended
    const extFeatures = getFeaturesByGroup('extended_interactions');
    renderFilterGroup('filter-extended-features', extFeatures, 'id');
    extFeatures.forEach(f => { activeFilters.ids.add(f.id); controlledIDs.add(f.id); });

    // Meta Conversation
    const metaFeatures = getFeaturesByGroup('meta_conversation');
    renderFilterGroup('filter-meta-features', metaFeatures, 'id');
    metaFeatures.forEach(f => { activeFilters.ids.add(f.id); controlledIDs.add(f.id); });
}

function renderFilterGroup(containerId, items, filterType) {
    const container = document.getElementById(containerId);
    if (!container) return; // Guard
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

        // Dot (Removed for features as requested)
        // const dot = document.createElement('span');
        // dot.style.display = 'inline-block';
        // dot.style.width = '8px';
        // dot.style.height = '8px';
        // dot.style.borderRadius = '50%';
        // dot.style.marginRight = '8px';

        // // Color logic
        // if (item.nodeType === 'bot') dot.style.backgroundColor = colors.bot[1];
        // else if (item.nodeType === 'domain') dot.style.backgroundColor = colors.domain[1];
        // else dot.style.backgroundColor = item.color || '#999';

        label.appendChild(input);
        // label.appendChild(dot);
        label.appendChild(document.createTextNode(item.label));
        container.appendChild(label);
    });
}

function updateFilters(type, value, isChecked) {
    if (type === 'id') {
        if (isChecked) activeFilters.ids.add(value);
        else activeFilters.ids.delete(value);

        // Sync checkboxes
        document.querySelectorAll(`input[data-value="${value}"]`).forEach(cb => cb.checked = isChecked);

        // Domain Sync
        if (lookup.domainToBots && lookup.domainToBots.has(value)) {
            const botIds = lookup.domainToBots.get(value);
            botIds.forEach(botId => {
                if (isChecked) activeFilters.ids.add(botId);
                else activeFilters.ids.delete(botId);
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

        // 1. Bots
        cy.nodes('[nodeType="bot"]').forEach(node => {
            const data = node.data();
            const isChecked = activeFilters.ids.has(data.id);
            if (isChecked) {
                visibleBots.add(data.id);
                node.style('display', 'element');
            } else {
                node.style('display', 'none');
            }
        });

        // 2. Others
        cy.nodes().forEach(node => {
            const data = node.data();
            if (data.nodeType === 'bot') return;

            // Simple Visibility Check based on ID filter
            if (activeFilters.ids.has(data.id)) {
                // Check connectivity to visible bot if it's a feature
                if (data.nodeType === 'feature') {
                    const providers = lookup.featureBots.get(data.id);
                    let connected = false;
                    if (providers) {
                        for (let p of providers) {
                            if (visibleBots.has(p)) { connected = true; break; }
                        }
                    }
                    if (connected) node.style('display', 'element');
                    else node.style('display', 'none');
                } else {
                    node.style('display', 'element');
                }
            } else {
                // If explicitly unchecked (controlled)
                if (controlledIDs.has(data.id)) {
                    node.style('display', 'none');
                } else {
                    // Non-controlled nodes (like User, Groups) -> Keep visible usually
                    node.style('display', 'element');
                }
            }

            // Domain special case: Hide if no children bots visible? 
            if (data.nodeType === 'domain') {
                if (activeFilters.ids.has(data.id)) node.style('display', 'element'); // Allow strict toggle
                else node.style('display', 'none');
            }
        });
    });
}


// --- Details Panel ---

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

    // --- Render all other fields except screenshots + description + id + duplicates ---
    html += Object.entries(data)
        .filter(([key]) => {
            const normalizedKey = key.trim().toLowerCase();
            return key !== 'screenshots' &&
                key !== 'description' &&
                key !== 'id' &&
                normalizedKey !== 'class';
        })
        .map(([key, value]) => {
            if (value === '' || value === null || value === undefined) return '';

            // Format value if it's a string and not an ID or URL
            let formattedValue = value;
            if (typeof value === 'string' && key !== 'id' && !value.startsWith('http')) {
                formattedValue = value
                    .replace(/_+/g, ' ')  // Replace _ or __ with space
                    .replace(/\b\w/g, c => c.toUpperCase()); // Title Case
            }

            return `
                <div class="detail-item">
                    <div class="detail-label">${key.replace(/_/g, ' ')}</div>
                    <div class="detail-value">${formattedValue}</div>
                </div>
            `;
        }).join('');

    content.innerHTML = html;

    // Dynamic Bot Selection
    currentlySelectedNodeId = data.id;
    updateBotSelector(data.id);

    // Reset scroll position to top
    const scrollArea = document.getElementById('panel-scroll-area');
    if (scrollArea) {
        scrollArea.scrollTop = 0;
    }

    // Show panel
    panel.classList.remove('hidden');
}

function hideDetails() {
    currentlySelectedNodeId = null;
    document.getElementById('details-panel').classList.add('hidden');
    clearDetailsUI();
}

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

// --- Display Toggles ---
function initDisplayToggles() {
    // 1. Node Labels
    const nodeLabelToggle = document.getElementById('toggle-node-labels');
    if (nodeLabelToggle) {
        nodeLabelToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                cy.style().selector('node').style('text-opacity', 1).update();
            } else {
                cy.style().selector('node').style('text-opacity', 0).update();
            }
        });
    }

    // 2. Edge Labels
    const edgeLabelToggle = document.getElementById('toggle-edge-labels');
    if (edgeLabelToggle) {
        edgeLabelToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                cy.style().selector('edge').style('text-opacity', 1).style('text-background-opacity', 1).update();
            } else {
                cy.style().selector('edge').style('text-opacity', 0).style('text-background-opacity', 0).update();
            }
        });
    }

    // 3. Show Graph Edges
    const edgesToggle = document.getElementById('toggle-show-edges-main');
    if (edgesToggle) {
        edgesToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                cy.edges().style('display', 'element');
            } else {
                cy.edges().style('display', 'none');
            }
        });
    }
}

// Sidebars
document.getElementById('sidebar-toggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
});
document.getElementById('close-details').addEventListener('click', hideDetails);



// --- Tutorial Logic ---
const tutorialSteps = [
    {
        title: "Welcome to Chatbot Feature Graph",
        content: "Explore the connections between 12 chatbots from 4 different domains and explore their features. This interactive graph visualizes how features are distributed across different chatbot platforms.",
        media: '<img src="assets/tutorial/tutorial_welcome.png?v=2" alt="Graph Overview" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">'
    },
    {
        title: "Understanding the Graph",
        content: "<strong>Nodes</strong> represent Chatbots (Large Circles), their Features and their Domains (Small Circles).<br><strong>Colors</strong> indicate categories: Orange for Chatbots, Green for Domains, Pink for System Features, and more.",
        media: '<img src="assets/tutorial/tutorial_nodes.png?v=2" alt="Node Types" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">'
    },
    {
        title: "Interacting with Nodes",
        content: "<strong>Hover</strong> over a node to highlight its connections.<br><strong>Click</strong> on a node to open the Detail Panel. For feature nodes, <strong>screenshots</strong> of the UI implementation are included.",
        media: '<img src="assets/tutorial/tutorial_interaction.png?v=2" alt="Interaction" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">'
    },
    {
        title: "Sidebar & Filters",
        content: "Use the Left Sidebar to filter visible nodes by category. You can toggle Bots, Domains, and various Feature Groups to focus your analysis.",
        media: '<img src="assets/tutorial/tutorial_sidebar.png?v=2" alt="Sidebar Filters" style="width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: 8px;">'
    },
    {
        title: "Analysis Tools",
        content: "Use the Analysis Tool at the top of the left sidebar to run clustering algorithms to find communities within the graph. Use the checkboxes to hide edges and labels for edges and nodes to get a cleaner view. You can also export snaphots of the graph in high-resoltuion pngs.",
        media: '<img src="assets/tutorial/tutorial_analysis.png?v=2" alt="Clustering Analysis" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">'
    }
];

let currentStep = 0;

function initTutorial() {
    const modal = document.getElementById('tutorial-modal');
    if (!modal) return;

    // Check LocalStorage
    const seen = localStorage.getItem('tutorial_seen');
    if (seen === 'true') {
        return; // Don't show
    }

    // Show Modal
    modal.classList.remove('hidden');
    renderStep(currentStep);

    // Event Listeners
    document.getElementById('tutorial-next-btn').addEventListener('click', nextStep);
    document.getElementById('tutorial-back-btn').addEventListener('click', prevStep);
    document.getElementById('tutorial-skip-btn').addEventListener('click', closeTutorial);
}

function renderStep(index) {
    const step = tutorialSteps[index];
    document.getElementById('tutorial-title').textContent = step.title;
    document.getElementById('tutorial-body').innerHTML = step.content;
    document.getElementById('tutorial-media').innerHTML = step.media;

    // Step Indicators
    const indicator = document.getElementById('step-indicator');
    indicator.innerHTML = '';
    tutorialSteps.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.className = `step-dot ${i === index ? 'active' : ''}`;
        indicator.appendChild(dot);
    });

    // Button and Indicator Logic
    const nextBtn = document.getElementById('tutorial-next-btn');
    const backBtn = document.getElementById('tutorial-back-btn');

    // Toggle Back Button Visibility
    if (index === 0) {
        backBtn.classList.add('hidden');
    } else {
        backBtn.classList.remove('hidden');
    }

    // Toggle Next/Finish Text
    if (index === tutorialSteps.length - 1) {
        nextBtn.textContent = 'Finish';
    } else {
        nextBtn.textContent = 'Next';
    }
}

function nextStep() {
    if (currentStep < tutorialSteps.length - 1) {
        currentStep++;
        renderStep(currentStep);
    } else {
        closeTutorial();
    }
}

function prevStep() {
    if (currentStep > 0) {
        currentStep--;
        renderStep(currentStep);
    }
}

function closeTutorial() {
    const modal = document.getElementById('tutorial-modal');
    modal.classList.add('hidden');

    const dontShow = document.getElementById('tutorial-dont-show').checked;
    if (dontShow) {
        localStorage.setItem('tutorial_seen', 'true');
    }
}



// --- Export Logic ---
const exportBtn = document.getElementById('export-btn');
if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        if (!cy) return;

        // 1. Export High-Res PNG (Scale 3 = ~300 DPI for typical screens)
        const pngContent = cy.png({
            output: 'blob',
            scale: 3,
            full: true, // Export full graph, not just current viewport
            bg: 'white' // White background for papers
        });

        // 2. Trigger Download
        const a = document.createElement('a');
        a.href = URL.createObjectURL(pngContent);
        a.download = 'graph_visualization_high_res.png';
        a.click();
    });
}
// Start
initGraph();