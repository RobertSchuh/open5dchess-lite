# Open 5D Chess: revival plan

Written 2026-10-10 by the Pi's Claude Code (session 2) for the PC Claude.
Owner: Robert (GitHub `robertschuh`). Goal: a working 5D chess site hosted on his
Raspberry Pi so he can play friends online, mostly from phone browsers.

## Where things stand

Upstream: GitLab group https://gitlab.com/5d-chess (author Shaun Wu / alexbay218, AGPL-3.0).

| Repo | Last activity | What it is |
|---|---|---|
| `chess-in-5d` | 2022-07 (v1.0.6) | React 16 + CRA4 (react-scripts 4, craco) web/Electron client, Material-UI, HashRouter. Local play, analysis, bots, plus online play against an account server |
| `5d-chess-js` | 2024-07 (v1.2.1) | Rules engine, chess.js-style API, 5DPGN/5DFEN import/export |
| `5d-chess-renderer` | 2022-06 (v1.1.16) | PixiJS 5 board renderer (pixi-viewport for pan/zoom) |
| `5d-chess-server` | 2022-12 | Express REST server with accounts, ELO, bcrypt, nedb/Mongo, optional XMPP chat |
| `5d-chess-clock` | 2022-12 | Time-control helper library |
| `5d-chess-haxe` | 2025-11 | Newer Haxe core (not needed now) |

**Why it's "broken":** the official server `https://server.chessin5d.net` is offline,
so everything online fails. The client at https://chessin5d.net still loads, and local
play works. The client's default server URL is in `src/state/settings.js`.

CRA4 / webpack 4 does not build on current Node without `NODE_OPTIONS=--openssl-legacy-provider`,
and the dependency tree is from around 2021 and has known vulnerabilities.

## What Robert wants

1. **A UI that works well in mobile browsers** (Android/Firefox is his main device).
2. **Accountless multiplayer with simple invite links.** Nothing about users is stored
   beyond one game session: no accounts, no DB, no ELO.
3. **An interface for LLMs to play against people.**
4. Dev happens on the PC. The Pi (Pi 3B, 1 GB RAM, aarch64) only runs the finished product.

## Recommended architecture

```
open5dchess/
  client/   fork of chess-in-5d, moved to Vite, accounts/rankings/XMPP removed, mobile layout
  server/   new small Node server (Express or Fastify + ws), in-memory games only
  mcp/      MCP server (stdio) that lets an LLM take a seat via an invite link
  deploy/   systemd unit + notes for the Pi
```

Use the current **Node LTS** (check which; the Pi will install the same major).
Use **no native npm modules** in `server/` (no bcrypt, no jimp, no sharp), so the Pi just runs `npm ci --omit=dev`.

### 1. Server (new, replaces 5d-chess-server)
- `POST /api/games` with `{variant, timeControl?, creatorColor}` returns `{gameId, links: {white, black, spectate}}`.
  A link looks like `https://<host>/#/g/<gameId>?seat=<token>`.
  Seat tokens: 128-bit random, compared in constant time. The token is the only credential.
- WebSocket `/ws?game=&seat=`: joining, live state pushes, and `move` / `undo` / `submit` messages.
  The client may stage moves locally, but **the server validates every action with `5d-chess-js`**
  and broadcasts the result. Spectator links are read-only.
- Optional nickname per seat, kept in memory only.
- **Nothing persisted.** A game is deleted 1 h after it ends, or after 24 h without activity.
  After a server restart all games are gone, which is accepted.
- Clock: server-authoritative if a time control is set (reuse `5d-chess-clock`).
- Abuse limits: a cap on concurrent games (e.g. 50), a per-IP rate limit on game creation,
  a max message size, and per-socket move rate limits. Trust `X-Forwarded-For` only from localhost (it sits behind Tailscale Funnel).
- Text endpoints for LLMs and scripts (same auth via seat token):
  - `GET /api/games/:id/state?seat=` returns JSON: whose turn, action number, 5DPGN so far,
    5DFEN of the present boards, `chess.print()` text render, in-check/mate flags, and
    **legal moves for the current player** (`moves('5dpgn', ...)`).
    Don't enumerate full actions; that can explode combinatorially.
  - `POST /api/games/:id/moves?seat=` takes a body of one or more moves in 5DPGN, then `submit`. Return clear errors for illegal moves.
  - `GET /api/games/:id/wait?seat=&since=`: long-poll until it's that seat's turn or the game ends.
- Serves the built client as static files from the same port. HashRouter means no SPA rewrites are needed.
- Tests: unit tests on game lifecycle, token checks, illegal-move rejection, expiry, and limits.
  Plus one end-to-end test with two WebSocket clients playing a short game, including a time-travel move.

### 2. Client (fork of chess-in-5d)
- Move the build from CRA4/craco to **Vite**. Keep React. Upgrade React or MUI only if it's cheap;
  a working build matters more than new versions.
- Remove: login/register/recover/profile, rankings, server sessions UI, XMPP/ConverseManager, Electron.
- Keep: local play, analysis/import/export, bot play, settings, themes, piece sets.
- Add online play against the new server: "New online game" → choose variant, time control and colour →
  show both links with copy/share buttons (Web Share API on mobile) → wait screen → game.
  Reconnect automatically when the socket drops (phones sleep).
- **Mobile layout** (test at 360×800 and in landscape):
  - The board fills the screen; pinch-zoom and one-finger pan via pixi-viewport, with no accidental browser zoom
    (`touch-action: none` on the canvas, correct viewport meta).
  - Bottom action bar with large buttons: Undo, Submit, "jump to present", zoom to fit.
  - Tap-to-select / tap-to-move with clear highlighting. No drag-only interactions, no hover-only info.
  - Menus and dialogs as full-screen sheets on narrow screens.
  - Check performance on a mid-range Android: limit resolution/devicePixelRatio and turn off FPS-heavy effects by default.
- Lazy-load the bot and analysis code so the first mobile load stays small.
- Point the API/WS URL at a relative path (same origin), so one build works on LAN, tailnet and Funnel.

### 3. LLM interface (`mcp/`)
- A stdio MCP server. Config: the invite link (or server URL + seat token).
- Tools: `get_state`, `list_legal_moves`, `make_moves(moves[])` (validate, then submit as one action),
  `wait_for_turn`, `resign`, and maybe `explain_notation` (a short 5DPGN cheat-sheet in the tool description).
- It's a thin client over the text endpoints above, with no game logic of its own.
- Document how to connect it from Claude Code (`claude mcp add ...`) and how any other LLM can use the plain HTTP endpoints.
- Note in the README: LLMs will play weakly at 5D chess. The legal-move list prevents illegal moves, not bad ones.

### 4. Licence / publishing
AGPL-3.0: users who play over the network must be able to get the source. The plan is a
**public GitHub repo `robertschuh/open5dchess`**, with a "Source" link in the UI footer. Keep the
upstream licence files and credits. **Confirmed by Robert 2026-10-10: public GitHub repo is OK.**

## Deployment target (Pi), for the PC Claude's awareness
- Raspberry Pi 3B, 1 GB RAM (two headless Claude sessions already use most of it), aarch64, Pi OS Trixie.
  Node is not installed yet; the Pi Claude will install the same major LTS.
- Budget: server RSS under about 100 MB idle. Measure it on the PC with a few concurrent games.
- The Pi Claude runs it as a systemd service, bound to localhost. Exposure is via Tailscale Funnel
  (public HTTPS; only ports 443/8443/10000) or tailnet sharing. Robert decides at deploy time.
  Pick the port with `PORT` env (default 8090 is fine; 8080 and 8099 are taken on the Pi).

## Handing the finished product back to the Pi
From the PC (it has SSH to the Pi as `pi@pi-server.local`):
1. Build: `client/dist` + `server/` (with `package-lock.json`, no `node_modules`) + `deploy/`.
2. `rsync -a --delete release/ pi@pi-server.local:~/projects/open5dchess/release/`
   (or `scp -r` if rsync is missing).
3. Write `release/RELEASE-NOTES.md`: version/commit, Node major, env vars, the start command, how to run tests,
   and known issues. Then tell Robert, and the Pi Claude will install and expose it.
