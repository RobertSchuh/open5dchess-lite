// 5d-chess-js prints pawn captures with the capturing file doubled whenever
// its piece disambiguation kicks in ("ddxc6"/"bbxc6" where several pieces can
// take on c6) — and then rejects its own spelling as move input. A doubled
// lowercase file letter before "x" cannot occur in valid 5DPGN, so collapsing
// it is safe both for generated names and for accepting either spelling.
export const fixPawnCaptures = (s) => typeof s === 'string' ? s.replace(/([a-h])\1x/g, '$1x') : s;
