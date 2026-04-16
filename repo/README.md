Project Type: web

# FlowForge SOP Canvas

Offline-first Vue.js single-page application for drafting, reviewing, verifying, publishing, and exporting SOP flow diagrams, approval chains, and incident response paths in internet-isolated environments.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed

No local Node.js or npm installation is required.

## Quick Start

```bash
docker-compose up
```

This builds and starts the development container with hot reload enabled.

Once the container is running, open your browser to:

```
http://localhost:5173
```

To stop the application, press `Ctrl+C` or run:

```bash
docker-compose down
```

## Authentication

The application uses a real client-side authentication system. There are no pre-seeded demo accounts. On first launch you must register a new user:

1. Open `http://localhost:5173`
2. You will be redirected to the **Login** page
3. Click **Register** to create a new account
4. Enter a username (3-50 characters) and password (8+ characters)
5. After registration, log in with the credentials you just created

> **Note:** All data (users, diagrams, sessions) is stored in the browser's IndexedDB. Each browser profile maintains its own independent database.

## How to Verify It Works

After running `docker-compose up` and opening `http://localhost:5173`:

1. **Registration** -- Click "Register", create an account, confirm you are redirected to the login page
2. **Login** -- Log in with your new credentials, confirm you reach the Dashboard
3. **Create a diagram** -- Click "New Diagram", choose "Blank diagram" or a template (e.g. Incident Response), enter a title, and confirm the canvas loads
4. **Add nodes** -- Drag a node (Action, Decision, etc.) from the node library onto the canvas; confirm it renders and snaps to grid
5. **Connect nodes** -- Use quick-connect handles to draw an edge between two nodes; confirm the connection appears
6. **Save and verify persistence** -- Wait 10 seconds for autosave (or navigate away and back); confirm the diagram is still present on the Dashboard
7. **Export** -- Open a diagram, click Export, and choose JSON or PNG; confirm the file downloads
8. **Persona switch** -- Go to Profile, switch persona (Author / Reviewer / Viewer); confirm the UI menus change accordingly

## Running Tests

Tests run on the host using the provided `run_test.sh` script, which requires Node.js (v20+) and npm on the host:

```bash
chmod +x run_test.sh
./run_test.sh
```

The script installs dependencies automatically if needed and exits with a non-zero code on failure.

> **Note:** There is currently no Docker-based test service. See [Required Repo Fixes](#required-repo-fixes) below.

## Production Build (Docker)

```bash
docker build -f Dockerfile.prod -t flowforge-prod .
docker run -p 80:80 flowforge-prod
```

The production image uses a multi-stage build (Node for compilation, nginx for serving) and is accessible at `http://localhost:80`.

## Core Concepts

### Personas (UI-only)

Three presentation-only personas change menus and available affordances. They do **not** enforce access control:

| Persona      | UX Focus                                                      |
| ------------ | ------------------------------------------------------------- |
| **Author**   | Full editing prompts, create/edit tools, publish preparation   |
| **Reviewer** | Review-focused menus, verification tools, inspection entry     |
| **Viewer**   | Reduced edit affordances, view/export/verification emphasis    |

### Diagram Creation

Create diagrams from a blank canvas or from built-in templates (Incident Response, Approval Chain, Safety Checklist).

### Canvas Features

- SVG-based zoomable canvas (10%-400%)
- 5 node types: Start, End, Decision, Action, Note
- Drag-and-drop with snap-to-grid
- Quick-connect handles for edge creation
- Orthogonal and curve routing modes
- Inspector drawer for node/edge property editing
- Undo/redo (200 steps) with history modal

### Traceability and Verification

- Generate traceability codes for nodes (SOP-XXX-TN format)
- Verification view: enter a code to highlight the matching node on the canvas

### Versioning and Concurrency

- Autosave every 10 seconds with immutable version snapshots (max 20)
- One-click rollback, BroadcastChannel multi-tab conflict detection

### Publishing

- Publish/retract lifecycle with structural validation
- Approved Library for published diagrams
- Inspection records with pass/fail results

### Import/Export

- JSON import with validation and error reporting
- JSON, SVG, and PNG export (PNG via Web Worker)
- Sample import files in `samples/`

### Data Management

- Backup, restore, and delete-all from Profile > Data Management
- Service Worker for offline static asset caching

## Architecture

```
src/
  components/     Vue components (common, diagrams, layout)
  composables/    Composition functions (autosave, concurrency)
  db/             IndexedDB schema
  router/         Vue Router with auth guards
  services/       Business logic (auth, audit, canvas, template, etc.)
  stores/         Pinia stores (auth, diagrams, preferences, ui, history)
  utils/          Utilities (id, masking, validation)
  views/          Page-level view components
  workers/        Web Workers (PNG export)
```

## Tech Stack

- Vue 3, Pinia, Vue Router (hash mode)
- IndexedDB via `idb`, Web Crypto API
- BroadcastChannel, Service Worker, Web Workers
- Vite, Vitest

## Required Repo Fixes

The following items are needed to fully support a Docker-contained workflow:

1. **Docker-based test service** -- `docker-compose.yml` does not include a test service. A `flowforge-test` service (or a `docker-compose.test.yml` override) should be added so tests can run via `docker-compose run --rm flowforge-test` without requiring host-installed Node.js.
2. **Test script naming** -- The test script is named `run_test.sh` (singular). If the audit expects `run_tests.sh` (plural), rename it or add a symlink.

## Local Development (Alternative)

If you prefer to run without Docker, Node.js v20+ and npm are required:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. This path is provided for contributor convenience but is not the primary setup method.
