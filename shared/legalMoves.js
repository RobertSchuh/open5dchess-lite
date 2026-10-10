//Legal move hints.
//
//In 5D chess a single move is never legal or illegal on its own: what counts
//is the whole action (all moves until submit). An action can be submitted when
//no king is in check and every present board has been moved on. So a move is
//'legal' here if there is at least one way to continue the action after it
//that ends in a submittable position.
//
//Results per move:
//  'legal'   - found a continuation that can be submitted
//  'illegal' - searched every continuation, none can be submitted
//  'unknown' - ran out of time (treated like 'legal' by the UI, so a legal
//              move is never hidden)

//Depth-first search for any submittable continuation of the current action.
//Moves on different boards can be made in any order, so positions reached
//twice (same hash) are skipped.
const canComplete = (chess, deadline, seen) => {
  if(chess.submittable()) { return 'yes'; }
  if(Date.now() > deadline) { return 'timeout'; }
  let timedOut = false;
  for(let move of chess.moves('object', false, false, false)) {
    let next = chess.copy();
    next.move(move);
    let hash = next.hash;
    if(seen.has(hash)) { continue; }
    seen.add(hash);
    let res = canComplete(next, deadline, seen);
    if(res === 'yes') { return 'yes'; }
    if(res === 'timeout') { timedOut = true; }
  }
  return timedOut ? 'timeout' : 'no';
}

//Classify every move from chess.moves('object', false, false, false), same order.
//`chess` must have skipDetection = true (so moves into check can be tried).
export const classifyMoves = (chess, totalBudgetMs = 4000, perMoveBudgetMs = 500) => {
  let end = Date.now() + totalBudgetMs;
  let res = [];
  for(let move of chess.moves('object', false, false, false)) {
    let next = chess.copy();
    next.move(move);
    let deadline = Math.min(end, Date.now() + perMoveBudgetMs);
    let found = canComplete(next, deadline, new Set());
    res.push(found === 'yes' ? 'legal' : found === 'no' ? 'illegal' : 'unknown');
  }
  return res;
}

//Does the player to move have any legal action at all? 'yes' | 'no' | 'timeout'.
//'no' means checkmate (if in check) or stalemate. Used instead of the
//engine's inCheckmate, which reports mate when its search times out.
export const hasLegalAction = (chess, budgetMs = 10000) => {
  return canComplete(chess, Date.now() + budgetMs, new Set());
}

//Copying a game copies its whole history, which the search doesn't need.
//Keep only what move generation, check detection and submittable() use.
export const trimState = (state) => {
  return Object.assign({}, state, {
    rawBoardHistory: state.rawBoardHistory.slice(-1),
    rawActionHistory: [],
    checkmateCache: [],
  });
}
