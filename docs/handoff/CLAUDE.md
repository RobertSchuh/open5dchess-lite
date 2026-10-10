# Open 5D Chess: instructions for the PC Claude

Read `PLAN.md` first. It has the goal, the architecture and the handoff back to the Pi.

## Setup
- Work in `~/projects/open5dchess` on the PC (create it, and copy this handoff folder in as `docs/handoff/`).
- Clone upstream from GitLab (public, no login needed; use the `5d-chess` group paths):
  `chess-in-5d`, `5d-chess-js`, `5d-chess-renderer`, `5d-chess-clock`
  (and `5d-chess-server` only as a reference). Example: `git clone https://gitlab.com/5d-chess/chess-in-5d.git`
- Start one new git repo for our project and keep the upstream history of `chess-in-5d` in `client/`
  (subtree or a plain copy plus a note of the upstream commit, whichever is simpler).
- Robert approved a **public** GitHub repo `robertschuh/open5dchess` (2026-10-10). Create it once the client builds; use his own `gh` login on the PC.

## How to work with Robert
- He's often on his phone: short replies, lead with the result, small tables.
- He writes Python. This project is JS because the engine is JS. Keep the code plain and readable,
  with comments where 5D chess rules make something non-obvious.
- Tests where logic isn't trivial (the server especially). Show test results.
- Verify, don't assume: run builds and tests, and check mobile layout in a real or emulated mobile viewport
  (Playwright with a mobile device profile is fine).
- Commit in small, described steps.
- Nothing is deployed to the Pi except through the release step in PLAN.md. Don't change
  anything else on the Pi over SSH; the Pi's own Claude manages it.

## Milestones (suggested order)
1. Upstream client builds and runs locally under Vite (local play works).
2. New server + online play via invite links (two browser tabs, then phone + PC on the LAN).
3. Mobile UI pass.
4. Text endpoints + MCP server; play one game Claude-vs-human as a test.
5. Memory/CPU check, release folder, rsync to the Pi, RELEASE-NOTES.md.
