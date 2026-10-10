# v3 experimental engine (Rust → WASM)

The legal-move search rewritten in Rust and compiled to WebAssembly. Same
input/output contract as `shared/legalMoves.js` (v2): `classifyMoves`,
`hasLegalAction`, identical move generation order, identical results on
complete (non-timeout) searches — enforced by `server/test/v3Engine.test.js`
over the full game corpus. Roughly **8–10× faster than v2**, which is itself
5–9× faster than the original 5d-chess-js plumbing (see
`docs/ENGINE-BENCH.md`).

- `engine-rs/` — the crate. Move semantics are a line-by-line port of the
  vendored upstream code in `shared/engine/` (same table orders, same quirks,
  e.g. the `positionIsAttacked` fall-throughs and the exact new-timeline index
  arithmetic).
- `engine.wasm` — the built artifact, committed so deployment (the Pi) needs
  no Rust toolchain. 64 KB.
- `../legalMovesV3.js` — Node wrapper: serializes a position into one `i32`
  buffer, runs the whole search inside WASM.

## What makes it fast

- Boards live in an arena of flat `[i8; 64]` arrays; the multiverse is a table
  of arena indices. Search uses **apply/undo** (at most two timeline pushes per
  move) instead of cloning the position per node.
- Per-board caches keyed by arena index (boards are immutable once a move is
  applied): content hash, piece lists by color, same-board king-capture pairs.
- The check scanner resolves the 25 possible (Δtimeline, Δturn) target boards
  **once per scanned board** and tests knight/king attacks as one delta-bitmask
  lookup per enemy king; rays whose first target board does not exist die on a
  single table lookup.
- Cross-root-move memoization in `classifyMoves`: the ~N per-move searches
  overlap heavily (move A then B reaches the same position as B then A).
  Positions visited by a search that completed with "no" are proven
  uncompletable; the unwind path of a "yes" is proven completable; check facts
  are pure functions of the position. Timeout results are never cached, so
  cached answers are always proofs.
- Per-depth buffer pools: the DFS allocates nothing on the steady path.

## Building

```sh
rustup target add wasm32-unknown-unknown
cd shared/v3/engine-rs
cargo build --release --target wasm32-unknown-unknown --lib
cp target/wasm32-unknown-unknown/release/open5d_engine.wasm ../engine.wasm
```

Native profiling build (phase timers print after a run):

```sh
cargo build --profile release-dbg
./target/release-dbg/profile <position.bin> <reps>
```

`position.bin` is the raw `i32` wire buffer (see `serialize` in
`shared/legalMovesV3.js`).

## Using it

Tests/benchmarks import `shared/legalMovesV3.js` directly. The game server
uses v2 by default; start it with `ENGINE_V3=1` to run move classification and
mate detection on v3 (per-call fallback to v2 on unsupported positions —
anything that is not an 8×8 board).

## Limits

- 8×8 boards only (all built-in variants are 8×8); the wrapper throws
  `V3Unsupported` otherwise.
- Node-only wrapper for now (synchronous WASM instantiation). The browser
  hints worker still uses v2; porting it is an async-init away.
- `threats()` (describe.js) still runs on v2 — it needs 5DPGN move naming,
  which lives in JS.
