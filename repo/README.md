Project Type: web

# FlowForge SOP Canvas

Offline-first Vue.js single-page application for drafting, reviewing, verifying, publishing, and exporting SOP flow diagrams, approval chains, and incident response paths in internet-isolated environments.

## Prerequisites

- Docker
- Docker Compose

No host-side Node.js, npm, database setup, or package installation is required.

## Quick Start

Run the application from the repository root:

```bash
docker compose up
```

Access the app at:

```text
http://localhost:5173
```

Stop the app with:

```bash
docker compose down
```

## Authentication

The app uses real client-side authentication backed by IndexedDB.

### Demo Credentials

The application seeds a deterministic demo account on startup:

| Access | Username | Password | Notes |
| --- | --- | --- | --- |
| Default authenticated user | `demo.author` | `DemoPass123!` | Seeded automatically on app bootstrap |
| Author persona | `demo.author` | `DemoPass123!` | Select **Author** on the Profile page |
| Reviewer persona | `demo.author` | `DemoPass123!` | Select **Reviewer** on the Profile page |
| Viewer persona | `demo.author` | `DemoPass123!` | Select **Viewer** on the Profile page |

Personas are UI-only presentation modes. They are not separate authorization roles or separate accounts.

You may also register additional local users from the Register page, but the seeded demo account is the canonical verification path.

## How to Verify It Works

After `docker compose up` and opening `http://localhost:5173`:

1. Open `/#/login`.
   Expected: the **Sign In** screen is visible.
2. Sign in with `demo.author` / `DemoPass123!`.
   Expected: you are routed to the Dashboard.
3. Open `/#/diagrams`.
   Expected: the seeded diagrams list is visible.
4. Create a new diagram or open an existing one.
   Expected: the editor loads with toolbar, node library, canvas, and inspector.
5. Drag a node onto the canvas and save.
   Expected: the node persists after navigation or reload.
6. Open `/#/library`.
   Expected: published diagrams are visible in the Approved Library.
7. Open `/#/profile`.
   Expected: the profile page shows the demo account, persona controls, audit-retention controls, backup/export options, and destructive-action confirmations.
8. Switch between **Author**, **Reviewer**, and **Viewer** on Profile.
   Expected: the UI affordances change to match the selected persona.

## Running Tests

Run the complete test suite through Docker:

```bash
./run_tests.sh
```

Optional subsets:

```bash
./run_tests.sh unit
./run_tests.sh e2e
./run_tests.sh unit e2e
```

`run_tests.sh` builds a dedicated Docker test image and runs lint, unit, and browser workflow tests in containers. No host-side package installation is required.

## Production Build (Docker)

Run the production container build:

```bash
docker compose up --build flowforge-prod
```

Access the production container at:

```text
http://localhost:8080
```

## Core Concepts

### Personas (UI-only)

| Persona | UX Focus |
| --- | --- |
| Author | Full editing prompts, create/edit tools, publish preparation |
| Reviewer | Review-focused menus, verification tools, inspection entry |
| Viewer | Reduced edit affordances, view/export/verification emphasis |

### Diagram Creation

Create diagrams from a blank canvas or from built-in templates such as Incident Response, Approval Chain, and Safety Checklist.

### Canvas Features

- SVG-based zoomable canvas
- drag-and-drop with snap-to-grid
- quick-connect handles for edge creation
- orthogonal and curve routing modes
- inspector drawer for node/edge property editing
- undo/redo with history modal

### Traceability and Verification

- generate traceability codes for nodes
- verification view can highlight matching nodes

### Versioning and Concurrency

- autosave with immutable version snapshots
- rollback support
- BroadcastChannel-based multi-tab conflict detection

### Publishing

- publish/retract lifecycle with structural validation
- approved library for published diagrams
- inspection records with pass/fail results

### Import/Export

- JSON import with validation and error reporting
- JSON, SVG, and PNG export
- PNG export via Web Worker

### Data Management

- backup, restore, and delete-all flows from Profile
- Service Worker for offline static asset caching

## Architecture

```text
src/
  components/     Vue components (common, diagrams, layout)
  composables/    Composition functions (autosave, concurrency)
  db/             IndexedDB schema
  router/         Vue Router with auth guards
  services/       Business logic (auth, audit, canvas, template, import/export, etc.)
  stores/         Pinia stores (auth, diagrams, preferences, ui, history)
  utils/          Utilities (id, masking, validation)
  views/          Page-level view components
  workers/        Web Workers (PNG export)
tests/
  unit/           Vitest component/store/service integration and unit coverage
  e2e/            Playwright browser workflow coverage
```

## Tech Stack

- Vue 3
- Pinia
- Vue Router (hash mode)
- IndexedDB via `idb`
- Web Crypto API
- BroadcastChannel
- Service Worker
- Web Workers
- Vite
- Vitest
- Playwright
