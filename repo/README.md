# FlowForge SOP Canvas

Offline-first Vue.js single-page application for drafting, reviewing, verifying, publishing, and exporting SOP flow diagrams, approval chains, and incident response paths in internet-isolated environments.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Build for Production

```bash
npm run build
```

The `dist/` folder contains the complete application with relative asset paths. Serve it from any static HTTP server:

```bash
npm run preview          # Vite preview server on port 4173
npx serve dist           # or any static HTTP server
```

> **Note:** The built app requires an HTTP server. Browsers block ES module scripts loaded via `file://` protocol.

## Running Tests

```bash
npm test           # Run all tests once
npm run test:watch # Watch mode
```

### `run_test.sh`

A standalone shell script that installs dependencies (if missing) and runs the full test suite in one step. It uses `set -euo pipefail` so it exits immediately on any failure and returns a non-zero exit code if tests fail.

```bash
chmod +x run_test.sh   # Make executable (first time only)
./run_test.sh
```

**Prerequisites:** Node.js (v18+) and npm must be available on `PATH`.

## Docker

```bash
docker compose up                                    # Dev with hot reload on :5173
docker build -f Dockerfile.prod -t flowforge-prod .  # Production image
docker run -p 80:80 flowforge-prod                   # Serve on :80
```

## Core Concepts

### Personas (UI-only)

The app uses three **presentation-only** personas that change menus, prompts, and available affordances. Personas do **not** enforce access control:

| Persona    | UX Focus |
|------------|----------|
| **Author** | Full editing prompts, create/edit tools, publish preparation |
| **Reviewer** | Review-focused menus, verification tools, inspection entry |
| **Viewer** | Reduced edit affordances, view/export/verification emphasis |

Switch personas from Profile or the persona badge in the topbar.

### Diagram Creation

Users can create diagrams from:
- **Blank diagram** - empty canvas
- **Template** - pre-built starting flows (Incident Response, Approval Chain, Safety Checklist)

Templates initialize the diagram with nodes and edges. The title and description are editable before creation.

### Canvas Features
- SVG-based zoomable canvas (10%-400%)
- 5 node types: Start, End, Decision, Action, Note
- Drag-and-drop from node library with snap-to-grid
- Quick-connect handles for edge creation
- Orthogonal and curve routing modes
- Inspector drawer for node/edge property editing
- Undo/redo (200 steps) with history modal

### Traceability and Verification
- Generate traceability codes for nodes (SOP-XXX-TN format)
- **Verification view**: enter a traceability code to highlight the matching node on the canvas
- Verification handles invalid codes, no-match, and empty states clearly
- Reachable via the "Verify" button in the editor toolbar

### Versioning and Concurrency
- Autosave every 10 seconds
- Immutable version snapshots (capped at 20 per diagram)
- One-click rollback to any retained version
- BroadcastChannel multi-tab conflict detection
- Save conflict resolution: refresh, duplicate current work, or ignore

### Publishing
- Publish/retract lifecycle with structural validation
- Approved Library for published diagrams
- Retraction with mandatory reason (min 10 characters)
- Inspection records with pass/fail results

### Import/Export
- JSON import with validation; errors shown via toast notification plus a dedicated Import Errors modal with exact JSON path details
- JSON, SVG, and PNG export
- PNG export runs in a Web Worker to keep the UI responsive
- Sample import files in `samples/`

### Data Management
- Backup/restore/delete-all accessible from Profile > Data Management
- Local audit retention notes with explicit confirmation and file-based backup coverage
- Typed confirmation phrase required for destructive delete-all
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
