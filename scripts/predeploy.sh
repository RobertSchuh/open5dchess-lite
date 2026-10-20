#!/usr/bin/env bash
# Pre-deploy gate: run this before any rsync to the Pi.
# Fails fast if server tests, the release build, or the E2E game suite break.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== server tests =="
npm test --prefix server
echo "== release build =="
bash scripts/make-release.sh
echo "== e2e game suite (online + local play) =="
node scripts/e2e-games.mjs
echo "== predeploy gate PASSED =="
