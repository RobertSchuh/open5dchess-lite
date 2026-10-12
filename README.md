# Chess In 5D Lite (open5dchess-lite)

A trimmed, self-hostable fork of [Chess In 5D](https://gitlab.com/alexbay218/chess-in-5d)
by Shaun Wu — 5D chess with multiverse time travel in the browser — rebuilt around
invite-link online play and a fast Rust engine, small enough to run on a Raspberry Pi 3B.
Inspired by [5D Chess With Multiverse Time Travel](https://www.5dchesswithmultiversetimetravel.com/)
by Thunkspace.

## What's different from upstream

- **No accounts.** Creating a game returns invite links (white / black / spectate);
  games live in server memory and expire after they end.
- **Fast engine.** Move legality and mate detection run in a Rust→WASM engine
  (`shared/v3/engine-rs`). Mate proofs use a hypercuboid action search (after
  [ftxi/5dchess_engine](https://github.com/ftxi/5dchess_engine) and
  [penteract/cwmtt](https://github.com/penteract/cwmtt)): positions that take a
  naive search hours resolve in seconds. The original JS engine remains as the
  differential-test oracle.
- **LLM-friendly API.** `GET /api/games/<id>/llm?seat=<token>` serves rules,
  the full position, threats and legal moves as plain text; moves go over POST
  (or GET for fetch-only agents). An MCP server (`mcp/`) lets AI assistants play.
- **Lite client.** One piece set, two fonts, English only, ~5 MB built.

## Running

```sh
# server (serves the built client too)
cd server && npm ci && PORT=8090 node src/index.js

# client build
cd client && npm ci && npm run build   # output in client/dist

# tests (engine differential suites included)
cd server && npm test
```

Deployment to a small ARM box (systemd unit, Tailscale Funnel, budgets):
see `deploy/README.md`. Engine benchmarks and validation: `docs/` and
`scripts/engine-diff.mjs` (four-engine differential harness).

## License

AGPL-3.0, like the upstream project — see `LICENSE`. Piece art and sounds
carry their own notices (`client/src/assets/`).
