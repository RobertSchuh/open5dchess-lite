# Vendored 5d-chess-js core (fast engine)

`board.js`, `piece.js`, `turn.js` are copied (converted to ES modules: `exports.x` -> `export const x`, `this.x()` -> `x()`, requires -> imports) from
[5d-chess-js](https://gitlab.com/5d-chess/5d-chess-js) `src/` at upstream
commit `ee403c8` (v1.2.1), AGPL-3.0, with only:
- requires rewritten from `@local/x` to `./x.cjs`,
- `parse.js` stubbed in board.cjs (only reachable through a dead switch case).

They are the single source of truth for MOVE SEMANTICS in the fast engine
(`shared/fastPosition.js`): move generation and move application run this
exact upstream code. The fast engine only replaces the plumbing around it
(copy-on-write clones, early-exit check detection, cheap hashing).
