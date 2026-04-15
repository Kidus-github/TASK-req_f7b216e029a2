#!/usr/bin/env bash
set -euo pipefail

# Force devDependencies to be installed even if the harness sets
# NODE_ENV=production or an --omit=dev flag upstream. Without this,
# `vite` and `vitest` silently get skipped and tests fail with
# ERR_MODULE_NOT_FOUND: Cannot find package 'vite'.
export NODE_ENV=development
export npm_config_production=false
export npm_config_omit=
export npm_config_include=dev

# Reinstall if node_modules is missing or if either of the two packages
# that vite.config.js needs at load time are absent.
if [ ! -d "node_modules" ] || [ ! -d "node_modules/vite" ] || [ ! -d "node_modules/vitest" ]; then
  echo "Installing dependencies (including devDependencies)..."
  npm ci --include=dev
fi

# Use the npm script, not `npx vitest run`. `npx` will pull a fresh
# vitest into its own sandbox if it can't find one on PATH, and that
# sandboxed vitest cannot resolve the project's local `vite` package
# when loading vite.config.js. `npm test` resolves the binary through
# ./node_modules/.bin, so module resolution walks the project tree and
# finds vite correctly.
echo "Running tests..."
npm test
