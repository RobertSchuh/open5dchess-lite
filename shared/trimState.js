//Strip a chess.state() down to what rebuilding a position needs (the full
//action/board history is irrelevant and large). Shared by every engine and
//the server; lives alone so the release can ship without the v2 search.
export const trimState = (state) => {
  return Object.assign({}, state, {
    rawBoardHistory: state.rawBoardHistory.slice(-1),
    rawActionHistory: [],
    checkmateCache: [],
  });
};
