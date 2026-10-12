# Patches for the gitignored reference/ engine clones

Apply after cloning (see the memory/handoff notes for the clone commands):

- `ftxi-black-pawn-double-timeline-step.patch` — ftxi/5dchess_engine generated
  the unmoved pawn's DOUBLE timeline step for white only; the black branch
  tested the white piece constant (copy-paste bug). Robert's ruling
  (2026-10-12): the double timeline step is legal for both colors, and only
  when the intermediate timeline's square (same coordinates) is empty — which
  is what the surrounding code already checks. `git apply` in
  reference/5dchess_engine, then rebuild (cmake --build build -j).

Without this patch, scripts/engine-diff.mjs reports "Invalid move" replay
errors on games containing that move.
