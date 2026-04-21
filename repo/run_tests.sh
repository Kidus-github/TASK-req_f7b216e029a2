#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# run_tests.sh
# -----------------------------------------------------------------------------
# Drives the full FlowForge test suite inside a Docker container so the host
# only needs Docker (no Node.js, no Playwright browsers). Tests are executed
# group-by-group; the first failing group aborts the run (set -euo pipefail
# + explicit group boundaries).
#
# Groups (executed in order):
#   1. lint        - Vue/JS syntax sanity check via `vite build --mode test`
#   2. unit        - Vitest unit tests in tests/unit with >90% coverage gate
#   3. e2e         - Playwright end-to-end tests in tests/e2e
#
# Usage:
#   ./run_tests.sh                 # run all groups
#   ./run_tests.sh unit            # run a single group
#   ./run_tests.sh unit e2e        # run a specific subset
#   SKIP_BUILD=1 ./run_tests.sh    # reuse an existing flowforge-test image
# -----------------------------------------------------------------------------

set -euo pipefail

# ---- configuration ----------------------------------------------------------
IMAGE_NAME="${IMAGE_NAME:-flowforge-test:local}"
DOCKERFILE="${DOCKERFILE:-Dockerfile.test}"
CONTAINER_PREFIX="${CONTAINER_PREFIX:-flowforge-test-run}"
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

ALL_GROUPS=(lint unit e2e)
REQUESTED_GROUPS=("$@")
if [ ${#REQUESTED_GROUPS[@]} -eq 0 ]; then
  REQUESTED_GROUPS=("${ALL_GROUPS[@]}")
fi

# ---- logging helpers --------------------------------------------------------
log()   { printf '\033[1;34m[run_tests]\033[0m %s\n' "$*"; }
ok()    { printf '\033[1;32m[run_tests]\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33m[run_tests]\033[0m %s\n' "$*"; }
fail()  { printf '\033[1;31m[run_tests]\033[0m %s\n' "$*" 1>&2; }

group_header() {
  local group="$1"
  printf '\n\033[1;36m============================================================\033[0m\n'
  printf '\033[1;36m  Group: %s\033[0m\n' "$group"
  printf '\033[1;36m============================================================\033[0m\n'
}

# ---- preflight --------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  fail "Docker is required but was not found on PATH."
  exit 127
fi

if ! docker info >/dev/null 2>&1; then
  fail "Docker daemon is not reachable. Start Docker and retry."
  exit 1
fi

cd "$PROJECT_ROOT"

# ---- build the test image (once per run) ------------------------------------
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  warn "SKIP_BUILD=1 set - reusing existing image '$IMAGE_NAME'."
else
  log "Building test image '$IMAGE_NAME' from '$DOCKERFILE'..."
  docker build \
    --file "$DOCKERFILE" \
    --tag "$IMAGE_NAME" \
    "$PROJECT_ROOT"
  ok "Test image built."
fi

# ---- helper: run a command inside a fresh container -------------------------
# Each group runs in its own disposable container so state never leaks between
# groups, and failures in one group produce a clear stop point.
run_in_container() {
  local group="$1"; shift
  local container_name="${CONTAINER_PREFIX}-${group}-$$"
  log "Starting container '$container_name' for group '$group'..."
  docker run \
    --rm \
    --name "$container_name" \
    --init \
    --ipc=host \
    --env CI=true \
    --env NODE_ENV=development \
    --env npm_config_production=false \
    --env npm_config_include=dev \
    --volume "$PROJECT_ROOT/coverage:/app/coverage" \
    --volume "$PROJECT_ROOT/playwright-report:/app/playwright-report" \
    --volume "$PROJECT_ROOT/test-results:/app/test-results" \
    "$IMAGE_NAME" \
    "$@"
}

# ---- group implementations --------------------------------------------------
run_group_lint() {
  group_header "lint"
  log "Verifying the project builds (catches syntax/import errors fast)..."
  run_in_container lint sh -lc 'npm run build --silent'
  ok "lint group passed."
}

run_group_unit() {
  group_header "unit"
  log "Running Vitest unit tests with >90% coverage enforcement..."
  run_in_container unit sh -lc 'npm run test:unit'
  ok "unit group passed (coverage thresholds >=90% enforced by vitest)."
}

run_group_e2e() {
  group_header "e2e"
  log "Running Playwright end-to-end tests (chromium, headless)..."
  # The playwright image already ships browsers; no extra install step needed.
  run_in_container e2e sh -lc 'npm run test:e2e'
  ok "e2e group passed."
}

# ---- ensure mounted output dirs exist on the host ---------------------------
mkdir -p \
  "$PROJECT_ROOT/coverage" \
  "$PROJECT_ROOT/playwright-report" \
  "$PROJECT_ROOT/test-results"

# ---- dispatcher: fail fast on the first broken group ------------------------
for group in "${REQUESTED_GROUPS[@]}"; do
  case "$group" in
    lint) run_group_lint ;;
    unit) run_group_unit ;;
    e2e)  run_group_e2e ;;
    *)
      fail "Unknown group: '$group'. Valid groups: ${ALL_GROUPS[*]}"
      exit 64
      ;;
  esac
done

echo
ok "All requested groups passed: ${REQUESTED_GROUPS[*]}"
