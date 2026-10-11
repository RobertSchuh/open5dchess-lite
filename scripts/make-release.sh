#!/usr/bin/env bash
# Assemble release/ for the Pi: built client + server + shared engines + deploy.
# No node_modules are shipped; the Pi runs `npm ci --omit=dev` itself.
set -euo pipefail
cd "$(dirname "$0")/.."

(cd client && npm run build >/dev/null)

rm -rf release
mkdir -p release/client release/server
cp -r client/dist release/client/dist
# Precompress text assets; the server sends file.gz when the browser accepts
# gzip (the 3.4 MB JS bundle is the whole first load on a phone).
find release/client/dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \
  -o -name '*.svg' -o -name '*.json' -o -name '*.map' -o -name '*.txt' \) \
  -exec gzip -k -9 {} +
cp -r server/src server/package.json server/package-lock.json release/server/
cp -r shared release/shared
rm -rf release/shared/v3/engine-rs/target
cp -r deploy release/deploy

commit=$(git rev-parse --short HEAD)
cat > release/RELEASE-NOTES.md <<EOF
# Open 5D Chess release

- Built: $(date -u +%Y-%m-%dT%H:%MZ) from commit $commit
- Node: 24 (pure-JS deps, \`npm ci --omit=dev\` in server/)
- Start: see deploy/README.md (systemd unit in deploy/open5dchess.service)
- Env vars: PORT (8090), HOST (127.0.0.1), PUBLIC_URL, ANALYSIS_WORKERS,
  ENGINE_V3 (=1 for the WASM engine), END_QUICK_MS, STATIC_DIR
- Tests: on the PC, \`npm test\` in server/ and mcp/
- Known: games are in-memory only (lost on restart); browser hints worker
  uses the JS engine; LLM threat analysis is 1 ply deep.
EOF

echo "release/ ready (commit $commit)"
du -sh release
