# 5d-chess-renderer (vendored)

Source of [5d-chess-renderer](https://gitlab.com/5d-chess/5d-chess-renderer) v1.1.16
(upstream commit `8ec9a20`), by Shaun Wu, AGPL-3.0 (see `LICENSE`).

Vendored so we can change it (legal-move piece highlights, mobile tweaks).
Changes from upstream:
- Converted from CommonJS + browserify aliases (`@local/...`) to ES modules
  so Vite can build it directly; PNG assets are imported as URLs.
- `highlightManager.js`: optional highlight of pieces that have a legal move
  (`global.legalPieces()`).
