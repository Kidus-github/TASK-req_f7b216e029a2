# question.md

## 1. Prompt Fit & System Alignment

**Question:** Does the added complexity (encryption, roles, recovery, multi-user handling) deviate from the original goal of a simple offline SOP canvas tool?

**Assumption:** The core business goal is a **single offline browser app for SOP creation**, not a complex enterprise system.

**Solution:**
Ensure all advanced features remain **non-intrusive** to core flows:

- Canvas editing, publishing, and exporting must work without exposing internal complexity
- Add test:
  `create → connect → publish → export` must succeed without requiring advanced configuration
- Keep security/recovery features only visible when explicitly invoked

---

## 2. Authentication Model Scope

**Question:** Should authentication rely purely on app-managed credentials or integrate browser-native credential systems?

**Assumption:** Offline constraints prevent reliance on browser-native or external systems.

**Solution:**

- Use **Web Crypto only (PBKDF2 + AES-GCM)**
- Do NOT use:
  - WebAuthn
  - Credential Management API

- Ensure deterministic local-only authentication flow

---

## 3. Password Hash Evolution

**Question:** How should the system handle future upgrades to hashing parameters?

**Assumption:** Existing users must remain compatible across upgrades.

**Solution:**

- Store per-user:
  - `passwordHashVersion`
  - `passwordKdfAlgorithm`
  - `passwordKdfIterations`

- Mark outdated hashes on login
- Rehash only during:
  - password change
  - explicit re-auth flow

---

## 4. Admin Password Reset vs Encrypted Data

**Question:** What happens to encrypted user data when an admin resets a password?

**Assumption:** Encryption is password-derived and cannot be bypassed.

**Solution:**

- Admin reset = **destructive to encrypted payloads**
- Require warning:

  > “Existing encrypted data may become inaccessible”

- Log audit event for reset

---

## 5. Password Policy Strength

**Question:** Should additional password complexity rules be enforced?

**Assumption:** Simplicity is prioritized in offline environments.

**Solution:**

- Enforce:
  - minimum 8 characters

- Block:
  - empty/whitespace-only
  - identical to username

- Provide **non-blocking strength indicator**

---

## 6. Session Synchronization Across Tabs

**Question:** Are session changes (logout, lock, blacklist) consistently enforced across all tabs?

**Assumption:** All tabs must reflect session state.

**Solution:**

- Use BroadcastChannel to propagate:
  - logout
  - lock
  - blacklist

- Force all tabs to update within **2 seconds**
- Add periodic session validation fallback

---

## 7. Multi-User Data Isolation

**Question:** Are private drafts and working data fully isolated per user?

**Assumption:** Shared devices introduce high leakage risk.

**Solution:**

- Scope by `userId`:
  - drafts
  - inspections
  - session state
  - recent files

- Clear memory on:
  - logout
  - user switch

- Test:
  - user A data invisible to user B

---

## 8. Persona vs Role Confusion

**Question:** Can UI personas be mistaken for permission roles?

**Assumption:** Naming overlap creates risk.

**Solution:**

- Enforce:
  - personas = UI only
  - roles = permission control

- Rename internal roles (`ViewerRole`, etc.)
- Add test ensuring persona change does not affect permissions

---

## 9. Encryption Boundary Definition

**Question:** Does application-layer encryption provide meaningful protection?

**Assumption:** It protects against casual access, not device compromise.

**Solution:**

- Document threat model explicitly
- Encrypt:
  - diagram payloads
  - inspections

- Do NOT claim device-level security
- Add tests for key purge on logout

---

## 10. Backup Data Exposure

**Question:** Can unencrypted backups leak sensitive data?

**Assumption:** Users may not understand the risk.

**Solution:**

- Default: encrypted backup
- Require double confirmation for unencrypted
- Add checksum validation tests

---

## 11. Backup Password Handling

**Question:** Should backup reuse login password?

**Assumption:** Reuse is insecure and reduces flexibility.

**Solution:**

- Require **separate backup password**
- Never reuse login password automatically

---

## 12. IndexedDB Schema Clarity

**Question:** Is the physical IndexedDB schema sufficiently defined?

**Assumption:** Logical models alone are insufficient.

**Solution:**

- Define object stores per entity
- Add required indexes:
  - `diagramId`
  - `ownerUserId`
  - `status`

- Document schema in `DATA_MODEL.md`

---

## 13. Referential Integrity Enforcement

**Question:** How are relationships enforced without foreign keys?

**Assumption:** IndexedDB lacks built-in constraints.

**Solution:**

- Use service-layer validation
- Wrap writes in atomic transactions
- Run integrity checks on startup

---

## 14. Storage Quota Handling

**Question:** How does the system behave when storage is full?

**Assumption:** Quota issues are common in offline apps.

**Solution:**

- Show blocking modal
- Provide options:
  - delete snapshots
  - export + clear data

- Suspend autosave until resolved

---

## 15. Corruption Recovery

**Question:** How is data corruption handled?

**Assumption:** Not all failures are equal.

**Solution:**

- Classify failures:
  - schema mismatch
  - decryption failure

- Enter recovery mode with:
  - export
  - restore
  - reinitialize options

---

## 16. Versioning vs Undo Conflicts

**Question:** Can autosave conflict with undo/redo state?

**Assumption:** Divergence is possible.

**Solution:**

- Autosave persists visible state only
- Undo remains session-scoped
- Add test:
  - undo → autosave → reload consistency

---

## 17. Concurrency Conflict Resolution

**Question:** Is conflict detection fully deterministic?

**Assumption:** Hash + version is sufficient if canonical.

**Solution:**

- Use:
  - version number
  - SHA-256 hash

- Require explicit overwrite confirmation
- No auto-merge

---

## 18. Multi-Tab Behavior

**Question:** What happens if multiple users edit same diagram?

**Assumption:** Published diagrams may be shared.

**Solution:**

- Non-owner users:
  - read-only

- Conflicts still tracked
- Permissions enforced before edits

---

## 19. Import Integrity

**Question:** Can imports create inconsistent diagrams?

**Assumption:** Import is high-risk.

**Solution:**

- 3-phase import:
  1. validate
  2. dedupe
  3. commit

- Single transaction
- Fail atomically

---

## 20. Node Deletion Edge Cases

**Question:** What happens to connected edges and historical references?

**Assumption:** Both must be handled correctly.

**Solution:**

- Delete node + edges atomically
- Preserve:
  - inspection history

- Undo restores all

---

## 21. Rendering Performance

**Question:** Can SVG handle maximum diagram size?

**Assumption:** Only with optimization.

**Solution:**

- Use:
  - memoization
  - requestAnimationFrame batching

- Avoid full DOM re-render

---

## 22. Error Handling Consistency

**Question:** Are all error types clearly defined?

**Assumption:** Without consistency, UX breaks.

**Solution:**

- Define:
  - blocking errors
  - warnings
  - recoverable errors
  - fatal errors

- Map each to UI behavior

---

## 23. Test Sufficiency

**Question:** Are tests covering critical scenarios?

**Assumption:** Core flows covered, edges may not be.

**Solution:**

- Add tests for:
  - auth security
  - quota handling
  - concurrency
  - recovery mode

---

## 24. Coverage Depth

**Question:** Does test coverage reach ~90% of meaningful behavior?

**Assumption:** Some areas are under-tested.

**Solution:**

- Target:
  - 90% core logic
  - 80% UI

- Strengthen:
  - encryption lifecycle
  - multi-user isolation

---

## 25. Engineering Quality

**Question:** Is the system modular and maintainable?

**Assumption:** Complexity increases risk of tight coupling.

**Solution:**

- Enforce service boundaries:
  - auth
  - diagram
  - encryption

- No cross-module mutation

---

## 26. Static Audit Readiness

**Question:** Can a reviewer understand system flow from repo alone?

**Assumption:** Clear entry points are required.

**Solution:**

- Provide:
  - README
  - run_test.sh
  - structure docs

---

## 27. Security Boundary Clarity

**Question:** Can reviewers identify auth and permission boundaries easily?

**Assumption:** Hidden logic is dangerous.

**Solution:**

- Centralize security logic
- Document boundaries
- Avoid UI-based enforcement

---

## 28. Coverage Mapping

**Question:** Can requirements be mapped to tests?

**Assumption:** Manual mapping is error-prone.

**Solution:**

- Add requirement-to-test mapping file
- Standardize test naming

---

## 29. Frontend State Traceability

**Question:** Can state transitions be traced clearly?

**Assumption:** Complex state flows are hard to debug.

**Solution:**

- Document state transitions
- Define Pinia store boundaries
- Add lifecycle tests

---

## 30. Repository Self-Sufficiency

**Question:** Can the repo be used independently?

**Assumption:** External dependencies reduce reliability.

**Solution:**

- Include:
  - setup instructions
  - sample data
  - tests

- No dependency on external docs or services

---
