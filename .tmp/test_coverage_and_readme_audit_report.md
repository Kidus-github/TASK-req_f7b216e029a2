# Test Coverage Audit

## Scope and Detection

- Audit mode: static inspection only for the repo assessment. No application runtime was used to infer architecture or endpoint inventory.
- Follow-up verification: after patching tests, I ran a filtered unit-test command for the modified files only. The individual tests passed, but the command still exited non-zero because this repo enforces whole-suite coverage thresholds even on filtered runs.
- Declared project type: `web` ([README.md](/abs/path/README.md:1)).
- Type confirmation by structure: Vue SPA with client routes in [src/router/index.js](/abs/path/src/router/index.js:1), browser-only services in [src/services/authService.js](/abs/path/src/services/authService.js:1), and IndexedDB persistence in [src/db/schema.js](/abs/path/src/db/schema.js:1).
- Backend/API status: no server framework, controller layer, HTTP router, or API client surface was found. `src/router/index.js` defines client-side hash routes only.

## Backend Endpoint Inventory

No backend HTTP endpoints were found.

Evidence:
- [src/router/index.js](/abs/path/src/router/index.js:6) `/login`
- [src/router/index.js](/abs/path/src/router/index.js:12) `/register`
- [src/router/index.js](/abs/path/src/router/index.js:18) `/`
- [src/router/index.js](/abs/path/src/router/index.js:24) `/diagrams`
- [src/router/index.js](/abs/path/src/router/index.js:30) `/diagrams/:id`
- [src/router/index.js](/abs/path/src/router/index.js:36) `/library`
- [src/router/index.js](/abs/path/src/router/index.js:42) `/profile`
- [src/services/authService.js](/abs/path/src/services/authService.js:1) persists directly to IndexedDB via `getDB()`, not over HTTP.
- [src/db/schema.js](/abs/path/src/db/schema.js:1) defines browser-local object stores, confirming local persistence rather than server APIs.

## API Test Mapping Table

| Endpoint | Covered | Test Type | Test Files | Evidence |
| --- | --- | --- | --- | --- |
| None found | N/A | N/A | N/A | No backend HTTP endpoint definitions found in inspected source |

## API Test Classification

1. True No-Mock HTTP

None found.

2. HTTP with Mocking

None found.

3. Non-HTTP (unit/integration without HTTP)

- Frontend browser workflow tests using Playwright in `tests/e2e/*.spec.js`, for example:
  - [tests/e2e/auth.spec.js](/abs/path/tests/e2e/auth.spec.js:9)
  - [tests/e2e/routes.spec.js](/abs/path/tests/e2e/routes.spec.js:15)
  - [tests/e2e/serviceWorker.spec.js](/abs/path/tests/e2e/serviceWorker.spec.js:34)
- Frontend unit/integration tests using Vitest + Vue Test Utils in `tests/unit/**/*.test.js`, for example:
  - [tests/unit/app.test.js](/abs/path/tests/unit/app.test.js:55)
  - [tests/unit/routerGuards.test.js](/abs/path/tests/unit/routerGuards.test.js:28)
  - [tests/unit/routesAndShell.test.js](/abs/path/tests/unit/routesAndShell.test.js:81)

## Mock Detection

No mocking was found in the browser e2e files inspected for route/auth workflows.

Mocking and stubbing are still present in some unit-level tests. Representative evidence:

- `authService.touchSession` and `authService.getInactivityTimeoutMs` are spied/mocked in [tests/unit/authStore.test.js](/abs/path/tests/unit/authStore.test.js:193) and [tests/unit/authStore.test.js](/abs/path/tests/unit/authStore.test.js:211).
- Service worker dependencies (`fetch`, cache APIs, `self.addEventListener`, `clients.claim`) are simulated in [tests/unit/serviceWorker.test.js](/abs/path/tests/unit/serviceWorker.test.js:36), [tests/unit/serviceWorker.test.js](/abs/path/tests/unit/serviceWorker.test.js:63), and [tests/unit/serviceWorker.test.js](/abs/path/tests/unit/serviceWorker.test.js:81).
- `BroadcastChannel` is replaced with an in-memory test double in [tests/unit/concurrencyRuntime.test.js](/abs/path/tests/unit/concurrencyRuntime.test.js:72).
- `exportService` now uses the real DOM anchor path, but still spies on `URL.createObjectURL`, `URL.revokeObjectURL`, and `HTMLAnchorElement.prototype.click` in [tests/unit/exportService.test.js](/abs/path/tests/unit/exportService.test.js:55) and [tests/unit/exportService.test.js](/abs/path/tests/unit/exportService.test.js:75).

Strict classification impact:
- These mocked cases are not true no-mock HTTP tests.
- They do not negate frontend unit-test presence, but they still reduce purity for the specific units involved.

## Coverage Summary

- Total backend HTTP endpoints: `0`
- Endpoints with HTTP tests: `0`
- Endpoints with true no-mock HTTP tests: `0`
- HTTP coverage %: `N/A (0 endpoints discovered)`
- True API coverage %: `N/A (0 endpoints discovered)`

## Unit Test Summary

### Backend Unit Tests

- Backend unit tests: not applicable. No backend codebase or backend HTTP/API layer was found.
- Backend modules covered: none applicable.
- Important backend modules not tested: none applicable because no backend layer was found.

### Frontend Unit Tests

Frontend unit tests: PRESENT

- Frontend test files detected: `58` unit test files under `tests/unit` and `11` Playwright browser specs under `tests/e2e`.
- Frameworks/tools detected:
  - Vitest in [package.json](/abs/path/package.json:1) and [vitest.config.js](/abs/path/vitest.config.js:10)
  - Vue Test Utils in [package.json](/abs/path/package.json:1) and imports such as [tests/unit/app.test.js](/abs/path/tests/unit/app.test.js:3)
  - Playwright in [package.json](/abs/path/package.json:1) and [playwright.config.js](/abs/path/playwright.config.js:8)
  - `fake-indexeddb` in files such as [tests/unit/app.test.js](/abs/path/tests/unit/app.test.js:2)
- Direct frontend component/module evidence:
  - App shell: [tests/unit/app.test.js](/abs/path/tests/unit/app.test.js:55)
  - Router guards: [tests/unit/routerGuards.test.js](/abs/path/tests/unit/routerGuards.test.js:28)
  - Login/Register/Dashboard/Library/AppTopbar/ToastContainer: [tests/unit/routesAndShell.test.js](/abs/path/tests/unit/routesAndShell.test.js:81), [tests/unit/routesAndShell.test.js](/abs/path/tests/unit/routesAndShell.test.js:93), [tests/unit/routesAndShell.test.js](/abs/path/tests/unit/routesAndShell.test.js:110), [tests/unit/routesAndShell.test.js](/abs/path/tests/unit/routesAndShell.test.js:136), [tests/unit/routesAndShell.test.js](/abs/path/tests/unit/routesAndShell.test.js:153), [tests/unit/routesAndShell.test.js](/abs/path/tests/unit/routesAndShell.test.js:210)
  - Main bootstrap: [tests/unit/main.test.js](/abs/path/tests/unit/main.test.js:47)
  - Canvas/editor modules: `svgCanvas.test.js`, `canvasNode.test.js`, `canvasEdge.test.js`, `diagramEditorView.integration.test.js`, `diagramListView.integration.test.js`
  - Stores/services/composables: `authStore.test.js`, `diagramsStore.test.js`, `historyStore.test.js`, `preferencesStore.test.js`, `useAutosave.test.js`, `versionService.test.js`, `authService.test.js`, `backupService.test.js`
  - Strengthened diagram lifecycle coverage: [tests/unit/diagramService.test.js](/abs/path/tests/unit/diagramService.test.js:51), [tests/unit/diagramService.test.js](/abs/path/tests/unit/diagramService.test.js:68), [tests/unit/diagramService.test.js](/abs/path/tests/unit/diagramService.test.js:100)
  - Strengthened export/download coverage: [tests/unit/exportService.test.js](/abs/path/tests/unit/exportService.test.js:55), [tests/unit/exportService.test.js](/abs/path/tests/unit/exportService.test.js:75)
- Important frontend components/modules not clearly missing from direct file-level evidence:
  - None identified. Every source `.vue`/`.js` file under `src` had at least one basename-level reference in tests.

### Cross-Layer Observation

- Cross-layer balance is acceptable for a `web` SPA.
- The suite is frontend-heavy by design, which matches the architecture.
- There is no backend/API layer to offset or leave untested.

## API Observability Check

- API observability: not applicable. No backend API tests exist because no backend API endpoints were found.
- Browser-flow observability: strong in representative e2e files. Example:
  - [tests/e2e/auth.spec.js](/abs/path/tests/e2e/auth.spec.js:10) shows route input and redirect expectation for unauthenticated access.
  - [tests/e2e/auth.spec.js](/abs/path/tests/e2e/auth.spec.js:16) shows explicit registration inputs and post-login route assertion.
  - [tests/e2e/auth.spec.js](/abs/path/tests/e2e/auth.spec.js:35) shows invalid credentials and visible error assertion.

## Tests Check

- Success-path coverage: strong. Route access, login, registration, diagram creation/editing, publish/retract, import/export, profile, service worker, persistence, and concurrency flows are explicitly tested across `tests/unit` and `tests/e2e`.
- Failure-path coverage: present. Examples include wrong credentials, duplicate usernames, malformed import JSON, lock/re-auth flows, and validation failures.
- Edge-case coverage: improved. Diagram publish/retract metadata paths are now directly asserted in [tests/unit/diagramService.test.js](/abs/path/tests/unit/diagramService.test.js:68) and [tests/unit/diagramService.test.js](/abs/path/tests/unit/diagramService.test.js:100). Service worker/offline and concurrency cases are still exercised through simulated environments because native service worker and cross-tab BroadcastChannel runtimes are not available in jsdom.
- Validation/auth coverage: strong for frontend-authenticated behavior and client-side validation. Router guards are directly tested in [tests/unit/routerGuards.test.js](/abs/path/tests/unit/routerGuards.test.js:28).
- Integration boundary quality: mixed.
  - Strong: Playwright tests use a real browser and boot the built app through Playwright's `webServer` in [playwright.config.js](/abs/path/playwright.config.js:31).
  - Mixed: many unit/integration tests use real Vue/Pinia/router/IndexedDB, and `exportService` now uses the real DOM path for anchor creation/removal, but some browser/platform APIs are still simulated or spied.
- Assertion quality: generally meaningful. Many tests assert visible UI state, route transitions, persisted data, or side effects.
- Prior shallow placeholder removed:
  - The prior no-op `diagramService` case has been replaced with persisted transition assertions at [tests/unit/diagramService.test.js](/abs/path/tests/unit/diagramService.test.js:51), [tests/unit/diagramService.test.js](/abs/path/tests/unit/diagramService.test.js:68), and [tests/unit/diagramService.test.js](/abs/path/tests/unit/diagramService.test.js:100).
- `run_tests.sh` review:
  - Docker-based: yes. It builds and runs tests in containers via `docker build` and `docker run` in [run_tests.sh](/abs/path/run_tests.sh:67) and [run_tests.sh](/abs/path/run_tests.sh:81).
  - Local dependency requirement: not flagged. The script requires Docker only (`run_tests.sh:51`, `run_tests.sh:56`) and executes `npm run test:unit` / `npm run test:e2e` inside containers (`run_tests.sh:108`, `run_tests.sh:116`).

## End-to-End Expectations

- `fullstack` FE<->BE end-to-end expectation: not applicable. The project is declared and confirmed as `web`, not `fullstack`.
- For a `web` SPA, the existing Playwright suite is the correct end-to-end layer and is materially present.

## Test Coverage Score (0-100)

`94/100`

## Score Rationale

- Positive factors:
  - Large, directly evidenced frontend unit/integration suite.
  - Real browser e2e coverage exists and targets actual routes and workflows.
  - Coverage thresholds are explicitly configured in [vitest.config.js](/abs/path/vitest.config.js:58) with high numeric thresholds.
  - Test runner orchestration is Docker-contained in [run_tests.sh](/abs/path/run_tests.sh:67).
  - The previously shallow `diagramService` coverage gap is now closed with real persisted transition tests in [tests/unit/diagramService.test.js](/abs/path/tests/unit/diagramService.test.js:51), [tests/unit/diagramService.test.js](/abs/path/tests/unit/diagramService.test.js:68), and [tests/unit/diagramService.test.js](/abs/path/tests/unit/diagramService.test.js:100).
  - `exportService` download assertions now exercise the real DOM creation/removal path rather than intercepting `document.createElement`, reducing one avoidable source of over-mocking in [tests/unit/exportService.test.js](/abs/path/tests/unit/exportService.test.js:55) and [tests/unit/exportService.test.js](/abs/path/tests/unit/exportService.test.js:75).
- Negative factors:
  - No API surface exists, so API coverage sections are structurally non-applicable rather than satisfied.
  - Some unit tests still require simulated browser/platform runtimes where jsdom cannot supply the native environment, notably service worker and BroadcastChannel coverage.

## Key Gaps

- No backend/API endpoint layer exists, so API audit sections are mostly non-applicable rather than demonstrably covered.
- Some unit suites still rely on simulated browser/platform primitives instead of the native environment:
  - [tests/unit/serviceWorker.test.js](/abs/path/tests/unit/serviceWorker.test.js:36)
  - [tests/unit/concurrencyRuntime.test.js](/abs/path/tests/unit/concurrencyRuntime.test.js:72)
- `exportService` remains partially stubbed at the browser API layer, but the direct `document.createElement` interception gap has been reduced:
  - [tests/unit/exportService.test.js](/abs/path/tests/unit/exportService.test.js:55)
  - [tests/unit/exportService.test.js](/abs/path/tests/unit/exportService.test.js:75)
- No explicit shallow placeholder test remains in `tests/unit/diagramService.test.js`.

## Confidence and Assumptions

- Confidence: high.
- Assumptions:
  - Endpoint inventory is limited to backend HTTP endpoints per prompt definition. Client-side Vue routes were not reclassified as API endpoints.
  - Coverage claims are based on visible static evidence plus a filtered verification run for the modified tests only.
  - Verification note: the filtered unit tests for `diagramService` and `exportService` passed, but the repo's global coverage gate still fails on a filtered `vitest --coverage` run because whole-suite thresholds are enforced.

## Test Coverage Verdict

`PASS WITH NON-API LIMITATION`

Reason:
- The frontend test suite is clearly present and substantial.
- The backend/API portion is non-applicable because no backend HTTP layer exists.
- The specific weak gaps you identified have been materially reduced: the shallow `diagramService` case is gone, and `exportService` uses more of the real DOM path.
- Remaining score deductions are tied to unavoidable simulated runtimes for service worker and BroadcastChannel coverage.

# README Audit

## README Location

- Present at [README.md](/abs/path/README.md:1).

## Hard Gate Failures

None.

## High Priority Issues

- Production access instructions are incorrect.
  - README states production is available at `http://localhost:80` in [README.md](/abs/path/README.md:103).
  - Docker Compose exposes `flowforge-prod` on `8080:80` in [docker-compose.yml](/abs/path/docker-compose.yml:17).
  - This is a concrete operator-facing mismatch.

## Medium Priority Issues

- The README does not explicitly explain that browser e2e tests are run against a built preview server rather than the dev server.
  - Test execution is documented at [README.md](/abs/path/README.md:74).
  - Actual Playwright wiring uses `npm run build && npx vite preview` in [playwright.config.js](/abs/path/playwright.config.js:32).
  - This is not a hard-gate failure, but it is a documentation clarity gap.

## Low Priority Issues

- Authentication wording is mostly clear, but it mixes "access", "persona", and "role-like" presentation in the demo credentials table.
  - The README later clarifies personas are UI-only, not authorization roles, in [README.md](/abs/path/README.md:49).
  - This is acceptable, but the credentials section would be cleaner if it stated up front that only one seeded account exists.

## Compliance Check

- Formatting/readability: pass. The file is structured, scannable, and valid Markdown.
- Startup instructions for `web`: pass.
  - `docker-compose up` is present in [README.md](/abs/path/README.md:19).
- Access method: pass.
  - URL and port are present for the main app in [README.md](/abs/path/README.md:25).
- Verification method: pass.
  - Stepwise UI verification is present in [README.md](/abs/path/README.md:53).
- Environment rules: pass.
  - The README explicitly says no host-side Node.js, npm, DB setup, or package installation is required in [README.md](/abs/path/README.md:12).
- Demo credentials: pass.
  - Auth exists and demo credentials are documented in [README.md](/abs/path/README.md:38).
  - The README also explicitly states personas are UI-only, not separate authorization roles, in [README.md](/abs/path/README.md:49).
- Architecture/tech stack clarity: pass.
  - Architecture and tech stack sections are present in [README.md](/abs/path/README.md:157) and [README.md](/abs/path/README.md:175).

## README Verdict

`PARTIAL PASS`

Reason:
- All hard gates required for this `web` project are satisfied.
- The file is generally strong and operationally useful.
- One concrete production access instruction is wrong, which prevents a full pass.
