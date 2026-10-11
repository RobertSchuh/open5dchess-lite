# Deploying to the Pi

The release folder is self-contained except for Node and the server's npm
dependencies. Layout (mirrors the repo, so the server's relative paths work
unchanged):

```
release/
  client/dist/   built client, served as static files
  server/        game server (src/, package.json, package-lock.json)
  shared/        engines (JS v2 + WASM v3); imported by relative path
  deploy/        this folder
  RELEASE-NOTES.md
```

## Build + ship (on the PC)

```sh
scripts/make-release.sh                    # builds client, assembles release/
rsync -a --delete --exclude=node_modules release/ pi@pi-server.local:~/projects/open5dchess/release/
```

(`--exclude=node_modules` keeps the Pi's installed dependencies; without it,
`--delete` removes them and the service crash-loops until the next `npm ci`.)

## Install (on the Pi, once)

1. Node 24 (official arm64 tarball; no native modules are used, no toolchain
   needed):

   ```sh
   curl -fLO https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-arm64.tar.xz
   sudo mkdir -p /usr/local/lib/nodejs
   sudo tar -xJf node-v24.21.0-linux-arm64.tar.xz -C /usr/local/lib/nodejs
   sudo ln -sf /usr/local/lib/nodejs/node-v24.21.0-linux-arm64/bin/node /usr/local/bin/node
   sudo ln -sf /usr/local/lib/nodejs/node-v24.21.0-linux-arm64/bin/npm  /usr/local/bin/npm
   ```

2. Server dependencies (pure JS):

   ```sh
   cd ~/projects/open5dchess/release/server && npm ci --omit=dev
   ```

3. Service:

   ```sh
   sudo cp ~/projects/open5dchess/release/deploy/open5dchess.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now open5dchess
   curl -s localhost:8090/api/health   # -> {"ok":true,...}
   ```

## Updating a release

Re-run the build + rsync, `npm ci` again only if `package-lock.json` changed,
then `sudo systemctl restart open5dchess`. In-memory games are lost on
restart by design.

## Exposure

The server binds to 127.0.0.1. Options:

- **Tailscale Funnel** (public HTTPS): `sudo tailscale funnel --bg 8090`,
  then set `PUBLIC_URL=https://<machine>.<tailnet>.ts.net` via a systemd
  drop-in so invite links point at the public origin:

  ```sh
  sudo systemctl edit open5dchess   # [Service] Environment=PUBLIC_URL=https://...
  sudo systemctl restart open5dchess
  ```

- **Tailnet only**: `sudo tailscale serve --bg 8090` (HTTPS for tailnet
  members only), same PUBLIC_URL idea.

## Pi-specific tuning (already in the unit)

- `ANALYSIS_WORKERS=1` — 1 GB RAM shared with other services.
- `ENGINE_V3=1` — the WASM engine offsets the slow CPU (per-call JS fallback).
- `END_QUICK_MS=150` — shorter inline mate-check budget.
- `MemoryMax=350M` — hard cap; systemd restarts the service if it's exceeded.
