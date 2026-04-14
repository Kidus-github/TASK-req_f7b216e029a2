#!/usr/bin/env bash
set -euo pipefail

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm ci
fi

# Run the full test suite
echo "Running tests..."
npx vitest run
