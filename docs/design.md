# FlowForge SOP Canvas - Design Document

## 1. Overview

FlowForge SOP Canvas is an offline-first, browser-only single-page application for drafting, reviewing, verifying, publishing, and exporting SOP flow diagrams. It targets product managers, process owners, and frontline supervisors working in internet-isolated conference rooms.

The application runs entirely on the client. There is no backend server, no cloud sync, and no remote API dependency. All data is persisted locally in IndexedDB and LocalStorage using the browser's built-in storage APIs.

### Key Design Principles

- **Offline-first.** Every feature works without network access after initial load.
- **Single device, multiple users.** Local username/password authentication with masked display names for shared-room privacy.
- **Persona-driven UI.** Three presentation-only personas (Author, Reviewer, Viewer) adjust affordances without enforcing access control.
- **Deterministic persistence.** Pinia is the runtime source of truth; IndexedDB is the persisted source of truth. Autosave serializes state snapshots on a fixed interval.
- **Audit everything.** All significant actions produce append-only audit events stored locally.

---

## 2. Architecture

### 2.1 Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Vue 3 (Composition API) | Component model, reactivity |
| State | Pinia | Centralized reactive stores |
| Routing | Vue Router (hash mode) | Client-side navigation without server URL rewriting |
| Persistence | IndexedDB via `idb` | Structured local storage for all domain data |
| Preferences | LocalStorage | Lightweight key-value storage for UI preferences |
| Crypto | Web Crypto API | PBKDF2 password hashing, AES-GCM encryption |
| Multi-tab | BroadcastChannel | Cross-tab conflict detection and coordination |
| Offline | Service Worker | Static asset caching for offline relaunch |
| Export | Web Worker | Off-main-thread PNG rasterization |
| Build | Vite 8 | Development server, production bundling |
| Test | Vitest + jsdom + @vue/test-utils | Unit, integration, and component tests |
| IDs | uuid v4 | Globally unique identifiers for all entities |

### 2.2 Directory Structure

```
src/
  main.js                    App bootstrap and Service Worker registration
  App.vue                    Root component, theme watcher, inactivity timer
  style.css                  Global styles, CSS custom properties, layout system
  router/
    index.js                 Route definitions and authentication guards
  db/
    schema.js                IndexedDB database schema (14 object stores)
  stores/
    auth.js                  Authentication session state
    diagrams.js              Diagram, node, edge, image runtime state
    history.js               Undo/redo action stack (200 entries max)
    preferences.js           User preferences with LocalStorage sync
    ui.js                    Toast notifications and modal state
  services/
    authService.js           User CRUD, login, lockout, password hashing
    auditService.js          Append-only audit event logging
    backupService.js         Full-database backup, restore, delete-all
    canvasService.js         Node/edge CRUD with validation and limits
    concurrencyService.js    BroadcastChannel coordination
    diagramService.js        Diagram lifecycle and cascading operations
    encryptionService.js     PBKDF2 + AES-GCM via Web Crypto
    exportService.js         JSON/SVG/PNG export orchestration
    imageService.js          Embedded image storage and retrieval
    importService.js         JSON import with validation pipeline
    inspectionService.js     Quality inspection records and results
    localComplianceService.js  Audit retention notes
    publishService.js        Pre-publish structural validation
    templateService.js       Built-in diagram templates
    traceabilityService.js   Traceability code generation and lookup
    versionService.js        Snapshot versioning and rollback
  composables/
    useAutosave.js           10-second autosave interval management
    useConcurrency.js        Multi-tab conflict detection composable
  utils/
    alignment.js             Node alignment guide calculations
    id.js                    UUID v4 generation
    masks.js                 Display name masking
    persona.js               Persona configuration and helpers
    validation.js            Field-level validation rules and constants
  components/
    common/
      ConfirmModal.vue       Generic yes/no confirmation dialog
      TextConfirmModal.vue   Typed-phrase confirmation dialog
      ToastContainer.vue     Notification toast renderer
    layout/
      AppTopbar.vue          Navigation bar with persona badge
    diagrams/
      SvgCanvas.vue          Main SVG editing surface
      CanvasNode.vue         Individual node renderer with drag behavior
      CanvasEdge.vue         Edge path renderer (orthogonal/curve)
      NodeLibrary.vue        Draggable node type palette
      InspectorDrawer.vue    Right-panel property editor
      HistoryModal.vue       Undo/redo history viewer
      VersionPanel.vue       Version snapshot browser with rollback
      PublishModal.vue       Pre-publish validation and confirmation
      RetractModal.vue       Retraction reason input
      ImportModal.vue        JSON import with error detail modal
      InspectionPanel.vue    Inspection record and result management
      VerificationPanel.vue  Traceability code lookup and highlighting
      ConflictBanner.vue     Multi-tab conflict warning and resolution
  views/
    LoginView.vue            Sign-in and session unlock
    RegisterView.vue         Account creation
    DashboardView.vue        Statistics and recent files
    DiagramListView.vue      Diagram listing with blank/template creation
    DiagramEditorView.vue    Full-featured diagram editor (805 lines)
    ApprovedLibraryView.vue  Published diagram browser
    ProfileView.vue          Profile, persona, data management, compliance
  workers/
    pngExportWorker.js       OffscreenCanvas-based PNG rasterization
```

### 2.3 Layered Architecture

```
  Views (page-level components)
    |
    v
  Components (UI building blocks)
    |
    v
  Stores (Pinia - reactive runtime state)
    |
    v
  Services (deterministic business logic)
    |
    v
  IndexedDB / LocalStorage / Web Crypto / BroadcastChannel
```

**Views** compose components and orchestrate user interactions. They read from stores and call services.

**Stores** hold the authoritative runtime state. They are reactive wrappers around service calls that update local refs and trigger UI re-renders.

**Services** contain all business logic. They are plain JavaScript modules with async functions that interact directly with IndexedDB. Services never import Vue reactivity or store modules. They are independently testable.

**The database layer** (`db/schema.js`) provides a single `getDB()` function that opens and migrates the IndexedDB database. All services share this connection.

---

## 3. Data Model

### 3.1 IndexedDB Schema

The database (`flowforge-sop`, version 1) contains 14 object stores:

| Store | Key | Indexes | Purpose |
|-------|-----|---------|---------|
| `users` | `userId` | `by-username` (unique) | Local user accounts |
| `userPreferences` | `userId` | - | Per-user settings |
| `diagrams` | `diagramId` | `by-owner`, `by-status` | Diagram metadata and lifecycle |
| `nodes` | `nodeId` | `by-diagram` | Canvas node records |
| `edges` | `edgeId` | `by-diagram` | Canvas edge/connection records |
| `snapshots` | `snapshotId` | `by-diagram`, `by-diagram-version` | Immutable version snapshots |
| `traceability` | `assignmentId` | `by-diagram`, `by-node` | Traceability code assignments |
| `inspections` | `inspectionId` | `by-diagram` | Inspection session records |
| `inspectionResults` | `resultId` | `by-inspection` | Pass/fail inspection results |
| `publishEvents` | `publishEventId` | `by-diagram` | Status transition history |
| `embeddedImages` | `imageId` | `by-diagram` | Node-attached images as data URLs |
| `importJobs` | `importJobId` | - | Import job tracking |
| `importErrors` | `importErrorId` | `by-job` | Per-job validation errors |
| `auditEvents` | `auditEventId` | `by-entity`, `by-actor`, `by-time` | Append-only audit trail |
| `sessions` | `sessionId` | `by-user` | Authentication session records |
| `encryptionMetadata` | `encryptionRefId` | `by-scope` | Encryption parameter storage |
| `retractionRecords` | `retractionId` | `by-diagram` | Retraction reason records |

### 3.2 Key Entity Relationships

```
User 1---* Diagram
Diagram 1---* Node
Diagram 1---* Edge
Diagram 1---* Snapshot
Diagram 1---* Traceability Assignment
Diagram 1---* Inspection
Diagram 1---* EmbeddedImage
Inspection 1---* InspectionResult
Node 1---? Traceability Assignment
Node 1---? EmbeddedImage
Edge *---1 Node (source)
Edge *---1 Node (target)
```

### 3.3 Diagram Lifecycle States

```
draft ---> published ---> retracted ---> draft (re-edit)
  |            |              |
  v            v              v
archived   archived        archived
  |
  v
draft (restore)
```

Allowed transitions are enforced by `diagramService.transitionStatus()`. Retraction requires a reason of at least 10 characters.

---

## 4. Core Subsystems

### 4.1 Authentication

**Service:** `authService.js` | **Store:** `auth.js`

- Local username/password authentication. No external identity provider.
- Passwords hashed with PBKDF2-HMAC-SHA-256 (310,000 iterations, 16-byte salt, 32-byte output).
- Per-user encryption key derived from password at login via PBKDF2, used for AES-GCM-256 encryption of sensitive payloads.
- Encryption keys exist only in memory during an active session; never persisted.
- Account lockout after 5 failed login attempts within 15 minutes (15-minute lock duration).
- Session inactivity timeout (default 30 minutes, configurable 5-60 minutes via LocalStorage).
- Session lock/unlock flow with password re-entry.
- `isBlacklisted` and `isRiskTagged` are non-security local handling labels. They do not block login, unlock, or any auth operation.

### 4.2 Persona System

**Utility:** `persona.js` | **Store:** `preferences.js`

Three UI-only personas control affordances:

| Persona | Canvas Edit | Create Diagrams | Publish/Retract | Generate Trace | Inspections | Import |
|---------|-------------|-----------------|-----------------|----------------|-------------|--------|
| **Author** | Yes | Yes | Yes | Yes | Yes | Yes |
| **Reviewer** | No | No | Yes | No | Yes | No |
| **Viewer** | No | No | No | No | No | No |

Personas are **not a security boundary**. Any user can switch persona at any time from the Profile page or the topbar badge. They control which UI elements are enabled, not which operations are technically possible.

Each persona provides configuration fields consumed by views: `canEditCanvas`, `canCreateDiagram`, `canPublish`, `canGenerateTraceability`, `canInspect`, `canImport`, `canDeleteItems`, `canUseLibrary`, `canEditInspector`, plus prompt strings (`dashboardPrompt`, `diagramsPrompt`, `editorPrompt`, `editorModeLabel`).

### 4.3 Canvas Editor

**Components:** `SvgCanvas.vue`, `CanvasNode.vue`, `CanvasEdge.vue` | **Service:** `canvasService.js`

The diagram editor is an SVG-based canvas with:

- **Pan/zoom:** Transform-based, 10%-400% range, scroll-wheel zoom toward cursor.
- **5 node types:** Start (rounded), End (rounded), Decision (diamond), Action (rect), Note (rect). Each has a consistent card shell with type label, name, description, owner/department tags, icon badge, status badge, and optional embedded image.
- **Edge routing:** Orthogonal elbow paths and smooth cubic Bezier curves, toggled per edge.
- **Drag-and-drop:** Nodes dragged from the left-side NodeLibrary onto the canvas.
- **Grid snapping:** 20px grid, toggled via preferences.
- **Alignment guides:** During node drag, the system detects nearby alignment opportunities (left-left, center-center, right-right, top-top, middle-middle, bottom-bottom) within an 8px threshold. Matching candidates produce visible red dashed guide lines and snap the node position. Grid snap is applied first as a base, then alignment snap overrides when a candidate is within threshold.
- **Quick-connect handles:** Four circular handles on each node border for rapid edge creation.
- **Selection:** Single click, shift-click multi-select, and box-drag multi-select.
- **Limits:** 500 nodes and 800 edges per diagram, enforced at the service layer.

### 4.4 Undo/Redo

**Store:** `history.js`

- Session-scoped action history with a 200-entry cap.
- Each entry stores a `label`, `undo` function, and `redo` function.
- New mutations after an undo clear the redo branch.
- Oldest entries are pruned when the cap is reached.
- Atomic entries: deleting a node with connected edges creates a single undo entry that restores the node and all removed edges together.
- The HistoryModal shows entries with state labels (Current, Active, Discarded) and timestamps.

### 4.5 Versioning and Autosave

**Service:** `versionService.js` | **Composable:** `useAutosave.js`

- **Autosave** runs every 10 seconds while the app is open and the diagram is dirty. It is deferred during active gestures (drag, resize, text composition).
- Each save creates an **immutable snapshot** containing: diagram metadata, all nodes, all edges, all traceability assignments, all embedded images, all inspection records, and all inspection results.
- Snapshots are capped at **20 per diagram**. Pruning removes the oldest after a successful write.
- **Rollback** restores any retained snapshot into a new current version. It atomically clears and replaces all 6 entity types (nodes, edges, traceability, images, inspections, results) in a single IndexedDB transaction. Historical snapshot payloads are never mutated.
- A deterministic **revision hash** (DJB2) is computed from canonical serialized node/edge state for conflict detection.
- Autosave status is tracked as one of: `saved`, `dirty`, `saving`, `save_failed`, `paused_quota_error`.

### 4.6 Multi-Tab Concurrency

**Service:** `concurrencyService.js` | **Composable:** `useConcurrency.js`

- Uses `BroadcastChannel` to notify other tabs of diagram open/close/save events.
- When another tab saves a newer version (higher version number or same version but different revision hash), the current tab shows a `ConflictBanner` with three resolution options:
  - **Refresh to latest:** Discard local state and reload from IndexedDB.
  - **Duplicate my work:** Deep-clone current nodes/edges into a new diagram with fresh IDs.
  - **Ignore temporarily:** Suppress the warning for 60 seconds.
- No automatic merge is performed. All conflict resolution requires explicit user action.

### 4.7 Publish and Approved Library

**Service:** `publishService.js`, `diagramService.js`

Pre-publish validation enforces:
- Title present
- At least 1 node, 1 Start node, 1 End node
- All edges reference valid nodes
- No isolated non-Note nodes
- No duplicate traceability codes
- Current version saved (not dirty)

Published diagrams appear in the Approved Library view, visible to all authenticated local users. Retraction requires a reason (minimum 10 characters) and removes the diagram from the library.

### 4.8 Traceability and Verification

**Service:** `traceabilityService.js` | **Component:** `VerificationPanel.vue`

- Codes follow the format `SOP-{NNN}-{T}{n}` where `NNN` is a zero-padded diagram sequence, `T` is a type prefix (S/E/D/A/N), and `n` is a per-type sequence number.
- Codes are generated for selected nodes or all nodes and remain stable until explicitly regenerated.
- The **Verification Panel** allows entering a traceability code and highlights matching nodes on the canvas with a green glow overlay. It handles empty input, invalid format, and no-match states with clear feedback messages.

### 4.9 Inspections

**Service:** `inspectionService.js` | **Component:** `InspectionPanel.vue`

- Inspections are attached to a specific diagram version.
- Each result records: node reference, pass/fail, reviewer name (required), notes (required on fail), and timestamp.
- Inspection lifecycle: `open` -> `completed` -> `superseded`.
- Completed inspections are immutable. Corrections require a new inspection or marking the existing one as superseded.

### 4.10 Import/Export

**Services:** `importService.js`, `exportService.js` | **Component:** `ImportModal.vue`

**Import (JSON):**
- Three-phase pipeline: (1) parse and schema-validate, (2) deduplicate and remap, (3) apply in a single IndexedDB transaction.
- Maximum file size: 10 MB. Maximum records: 1,000.
- Duplicate detection: case-insensitive, whitespace-trimmed name + type match.
- Validation errors include exact JSON paths (e.g., `$.nodes[2].nodeId`) and field names.
- Errors surface via a toast notification and a dedicated Import Errors modal.
- Fatal validation errors prevent any mutation. Partial success is allowed for non-fatal duplicate warnings only.

**Export:**
- **JSON:** Full diagram with nodes, edges, traceability, inspection summary, embedded image metadata, and checksum.
- **SVG:** Serialized clone of the canvas SVG element with namespace.
- **PNG:** Delegated to a Web Worker (`pngExportWorker.js`) using `OffscreenCanvas` and `createImageBitmap`. Longest edge capped at 8,000 pixels. The main thread stays responsive during rasterization.

### 4.11 Backup, Restore, and Data Management

**Service:** `backupService.js` | **View:** `ProfileView.vue`

- **Backup** creates a JSON file containing all IndexedDB stores (diagrams, nodes, edges, snapshots, users, audit events, etc.) with a DJB2 checksum.
- **Restore** validates checksum and schema version, creates safety snapshots for existing diagrams, then replaces all data in a single transaction. Supports ownership remapping for legacy backups without user records.
- **Delete All** requires the typed confirmation phrase `DELETE ALL LOCAL FLOWFORGE DATA` and a two-step modal flow (backup prompt first, then typed confirmation).
- All three operations are accessible from Profile > Data Management.

### 4.12 Template-Based Creation

**Service:** `templateService.js`

Three built-in templates:
1. **Incident Response** - 8 nodes, 8 edges (triage, escalation, resolution workflow)
2. **Approval Chain** - 6 nodes, 6 edges (multi-level review with reject loop)
3. **Safety Checklist** - 8 nodes, 6 edges (pre-operation verification flow)

Templates are selected during diagram creation. The creation modal offers a Blank/Template tab picker. Template selection pre-populates title and description, then creates real nodes and edges via `canvasService.addNode`/`addEdge`.

---

## 5. Data Flow

### 5.1 Diagram Editing Flow

```
User drags node from NodeLibrary
  -> SvgCanvas @node-drop
    -> DiagramEditorView.handleNodeDrop()
      -> diagrams.addNode() [Pinia store]
        -> canvasService.addNode() [service]
          -> IndexedDB put('nodes', ...)
      -> history.pushEntry({ undo, redo }) [undo stack]
      -> isDirty = true
        -> useAutosave detects dirty
          -> versionService.createSnapshot() [after 10s]
            -> IndexedDB put('snapshots', ...)
            -> concurrencyService.notifyDiagramSaved()
```

### 5.2 Authentication Flow

```
User submits login form
  -> LoginView.handleLogin()
    -> auth.login(username, password) [Pinia store]
      -> authService.login() [service]
        -> IndexedDB get('users', ...) [lookup]
        -> encryptionService.hashPassword() [verify]
        -> IndexedDB put('sessions', ...) [create session]
        -> encryptionService.deriveEncryptionKey() [derive key]
      -> store updates: user, session, encryptionKey
      -> startInactivityTimer()
    -> router.push('/')
```

### 5.3 Rollback Flow

```
User clicks Restore in VersionPanel
  -> DiagramEditorView.handleRollback(snapshotId)
    -> versionService.rollback() [service]
      -> IndexedDB get('snapshots', snapshotId) [read payload]
      -> Single transaction:
        -> Clear nodes, edges, traceability, images, inspections, results
        -> Write snapshot nodes, edges, traceability, images, inspections, results
        -> Update diagram version + hash
        -> Create rollback snapshot record
    -> diagrams.openDiagram() [reload into Pinia]
    -> history.clear() [reset undo stack]
```

---

## 6. Routing

All routes use hash-based history (`/#/path`) for offline compatibility.

| Path | View | Auth Required | Purpose |
|------|------|--------------|---------|
| `/login` | LoginView | No | Sign-in and session unlock |
| `/register` | RegisterView | No | Account creation |
| `/` | DashboardView | Yes | Statistics, recent files |
| `/diagrams` | DiagramListView | Yes | Diagram listing, creation |
| `/diagrams/:id` | DiagramEditorView | Yes | Full diagram editor |
| `/library` | ApprovedLibraryView | Yes | Published diagram browser |
| `/profile` | ProfileView | Yes | Profile, preferences, data management |

The router guard redirects unauthenticated users to `/login` and authenticated users away from `/login` and `/register`.

---

## 7. State Management

### 7.1 Store Responsibilities

| Store | Reactive State | Purpose |
|-------|---------------|---------|
| `auth` | `user`, `session`, `encryptionKey`, `isLocked` | Session lifecycle |
| `diagrams` | `diagrams[]`, `currentDiagram`, `currentNodes[]`, `currentEdges[]`, `currentImages[]`, `selectedNodeIds[]`, `selectedEdgeIds[]`, `isDirty` | All diagram runtime state |
| `history` | `entries[]`, `currentIndex` | Undo/redo stack |
| `preferences` | `theme`, `gridEnabled`, `lastZoom`, `recentFiles[]`, `activePersona` | Persisted UI preferences |
| `ui` | `toasts[]`, `activeModal`, `modalProps` | Ephemeral UI state |

### 7.2 Single Source of Truth Policy

- **Runtime:** Pinia stores are authoritative. Components read from stores, never from IndexedDB directly.
- **Persisted:** IndexedDB is authoritative. On page load or diagram open, stores are populated from IndexedDB.
- **Sync:** Autosave serializes Pinia state into IndexedDB snapshots. Manual save does the same immediately.
- **Undo/redo:** Mutates Pinia state only. Does not create version snapshots.

---

## 8. Security

### 8.1 Password Handling

- PBKDF2-HMAC-SHA-256 with random 16-byte per-user salt, 310,000 iterations, 32-byte derived key.
- Hash parameters stored per user for forward-compatible rehashing.
- Constant-time hash comparison to prevent timing attacks.
- Password entry fields never prefilled.
- Password hashes, salts, and encryption salts excluded from sanitized user objects returned by the auth service.

### 8.2 Encryption

- AES-GCM-256 for application-layer encryption of sensitive payloads.
- Encryption key derived from password at login; never stored in IndexedDB or LocalStorage.
- Unique 12-byte IV per encrypted record write.
- Keys purged from memory on logout, session lock, or page unload.

### 8.3 Session Security

- Session token stored in IndexedDB, bound to userId and sessionId.
- Inactivity timeout locks the session and purges the encryption key.
- Locked sessions require password re-entry to unlock.
- No session data stored in URLs.

### 8.4 Display Name Masking

- Real names masked by default: first character plus asterisks per word (minimum 3), e.g., `J*** S****`.
- Unmasking is a deliberate reveal action in the Profile view.

---

## 9. Offline and Deployment

### 9.1 Service Worker

- Caches static assets (app shell, JS bundles, CSS) with versioned cache names.
- Network-first strategy with cache fallback for fetched resources.
- Stale caches from prior versions deleted during activation.
- App functions fully without the Service Worker; it enables offline relaunch only.

### 9.2 Build Configuration

- Vite with `base: './'` for relative asset paths.
- Built output served from any static HTTP server.
- The built app cannot be opened via `file://` protocol (ES modules require HTTP).
- Docker support: development container with hot reload, production container with Nginx serving the static build.

---

## 10. Testing Strategy

### 10.1 Test Infrastructure

- **Framework:** Vitest with jsdom environment
- **Component testing:** @vue/test-utils for mounting Vue components
- **IndexedDB simulation:** fake-indexeddb for service-layer integration tests
- **Entry point:** `npm test` or `./run_test.sh`

### 10.2 Test Organization

| Category | Files | Coverage |
|----------|-------|----------|
| **Service unit tests** | authService, canvasService, diagramService, encryptionService, imageService, importExport, inspectionService, localComplianceService, validation, masks | Business logic, validation rules, crypto parameters |
| **Domain flow tests** | diagramFlow, templateCreation, verification, rollbackCompleteness, backupRestore, diagramDuplication, fullLifecycleFlow | End-to-end service-layer flows |
| **Behavior tests** | alignment, blacklistLabel, personaModel, pngWorkerExport, concurrency | Specific behavioral requirements |
| **Component tests** | canvasNode, canvasEdge, nodeLibrary, inspectorDrawer, inspectionPanel, svgCanvas | Vue component rendering and interaction |
| **Integration tests** | appRoutes, diagramListView, diagramEditorView, profileView | Full view mounting with store/router wiring |
| **Utility tests** | main (SW registration) | Infrastructure |

### 10.3 What Cannot Be Tested in jsdom

- Real SVG rendering and visual output
- Canvas-based PNG rasterization (OffscreenCanvas requires a real browser)
- Service Worker registration and cache behavior
- BroadcastChannel message delivery (simulated via mock)
- Actual drag-and-drop pointer interactions across the SVG surface

---

## 11. Constraints and Limitations

- **No cloud sync.** All data is local to the browser on a single device.
- **No real-time collaboration.** Multi-tab coordination is warning-based, not merge-based.
- **No custom templates.** Users cannot save their own templates; only three built-in templates exist.
- **No PDF export.** Only JSON, SVG, and PNG.
- **No mobile-specific UI.** The app targets conference-room laptops with standard displays.
- **Browser storage limits apply.** IndexedDB quota varies by browser; the app surfaces quota errors with remediation options.
- **No background execution.** Autosave and pruning run only while the app is open.
- **Encryption is application-layer only.** Browser local storage cannot guarantee device-level encryption at rest.
