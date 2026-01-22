# Graph Cyto Neo

Graph Cyto Neo is a web-based tool designed to visualize and analyze relationships between chatbot features. It parses structured feature data from CSV files to build an interactive network graph, enabling users to explore connections and apply various clustering algorithms to identify feature groupings.

## Features

- **Interactive Graph Visualization**: Visualize relationships between Bots, Domains, and Features using a dynamic Cytoscape.js graph.
- **Clustering Algorithms**: Apply advanced community detection algorithms directly from the UI:
  - Louvain
  - Greedy Modularity
  - Spectral Clustering
  - Agglomerative Clustering
- **Backend API**: FastAPI-powered backend to handle graph data serving and complex clustering computations.

## Prerequisites

- Python 3.8+
- Node.js (optional, for frontend development, though frontend is currently served statically via FastAPI)

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd graph_cyto_neo
    ```

2.  **Create and activate a virtual environment:**
    ```bash
    python -m venv .venv
    source .venv/bin/activate  # On Windows: .venv\Scripts\activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

## Usage

### 1. Update Graph Data
You can update the graph data by editing `backend/static_graph.json`.


### 2. Start the Server
Run the FastAPI backend server:

```bash
vicorn backend.main:app --host 0.0.0.0 --port 8000
```

### 3. Access the Application
Open your web browser and navigate to:

```
http://localhost:8000
```

## Project Structure

- **backend/**
  - `main.py`: The FastAPI application entry point. Serves the API endpoints and the static frontend.
  - `static_graph.json`: Generated graph data file used by the frontend.

- **frontend/**
  - `index.html`: Main entry point for the web interface.
  - `app.js`: Frontend logic for graph rendering and interaction.
  - `assets/`: Static styles and resources.

## Dependencies

- **FastAPI**: Web framework for building APIs.
- **NetworkX**: Python package for the creation, manipulation, and study of the structure, dynamics, and functions of complex networks.
- **Python-Louvain**: Community detection for NetworkX.
- **Scikit-learn**: Machine learning tools used here for Spectral and Agglomerative clustering.
