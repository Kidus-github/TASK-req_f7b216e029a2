# FlowForge SOP Canvas - Assumptions

## Persona Model

1. **UI-only personas.** The app implements Author, Reviewer, and Viewer as presentation modes only. Personas change menus, prompts, and affordances but do not enforce access control. All authenticated users have equal capabilities. There are no admin, editor, or role-based authorization gates.

2. **Persona storage.** Active persona is stored in LocalStorage per browser. Default is Author.

## Authentication

3. **Local username/password authentication.** PBKDF2-HMAC-SHA-256 with random 16-byte salt, 310,000 iterations, 32-byte derived output. No external identity provider.

4. **Lockout policy.** 5 failed login attempts within 15 minutes locks the account for 15 minutes.

5. **Session inactivity timeout.** Default 30 minutes, configurable between 5 and 60 minutes via LocalStorage.

## Diagrams

6. **Template-based creation.** Users can create diagrams from blank or from a built-in template. Three templates are included: Incident Response, Approval Chain, and Safety Checklist. Templates initialize real nodes and edges in the new diagram.

7. **Diagram visibility.** Drafts are private to the owner. Published diagrams are visible to all authenticated local users in the Approved Library.

8. **Self-loop edges are disabled** in v1.

## Traceability and Verification

9. **Traceability codes** use format SOP-XXX-TN where T is the type prefix (S/E/D/A/N) and N is a sequence number.

10. **Verification view** allows users to enter a traceability code and see the matching node highlighted on the canvas. Invalid codes, no-match, and empty states are handled with clear feedback.

## Export

11. **PNG export runs in a Web Worker** using OffscreenCanvas and createImageBitmap to keep the main thread responsive. Longest edge capped at 8,000 pixels.

12. **SVG export** preserves vector fidelity and directional arrows.

## Import

13. **Import validation errors** are surfaced via a toast notification and a dedicated Import Errors modal with exact JSON path and field details.

14. **Import cap** is 1,000 total records. Maximum raw file size is 10 MB.

15. **Duplicate matching** uses case-insensitive, whitespace-trimmed comparison of name + card type.

## Data and Persistence

16. **Pinia is the authoritative runtime state**; IndexedDB is the authoritative persisted state.

17. **Relative base path (`./`)** is used in Vite config for portable static hosting.

18. **Hash-based routing** for offline compatibility without server-side URL rewriting.

19. **The built app requires an HTTP server.** ES module scripts cannot load via `file://` protocol.

## Versioning

20. **Rollback creates a new current version** from a historical snapshot. Historical payloads are never mutated.

21. **Version snapshots** capped at 20 per diagram.

22. **No automatic merge** for multi-tab conflicts. Explicit user resolution required.
