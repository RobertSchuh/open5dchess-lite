//REFERENCE IMPLEMENTATION (slow): the original search running on full
//5d-chess-js instances. Kept for differential testing and benchmarks against
//shared/legalMoves.js (the fast engine). Do not edit the algorithm here.
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

//Looks at the current checks. `dead`: some check can never be removed this
//action. That holds for a check on a single board (attacker and king on the
//same board) once that board's latest state has the opponent to move: we
//can't move there again, and moves on other boards can't change it.
//`hot`: timelines that still have a live check, to try their moves first.
const checkInfo = (chess) => {
  let checks = chess.checks('object');
  let res = { dead: false, hot: new Set() };
  if(checks.length === 0) { return res; }
  let latest = new Map();
  for(let tl of chess.board.timelines) {
    latest.set(tl.timeline, tl.turns[tl.turns.length - 1]);
  }
  for(let c of checks) {
    let sameBoard = c.start.timeline === c.end.timeline && c.start.turn === c.end.turn;
    let board = latest.get(c.start.timeline);
    if(sameBoard && board && board.turn === c.start.turn && board.player !== chess.player) {
      res.dead = true;
      return res;
    }
    res.hot.add(c.start.timeline);
    res.hot.add(c.end.timeline);
  }
  return res;
}

//Depth-first search for any submittable continuation of the current action.
//Moves on different boards can be made in any order, so positions reached
//twice (same hash) are skipped.
const canComplete = (chess, deadline, seen) => {
  if(chess.submittable()) { return 'yes'; }
  let info = checkInfo(chess);
  if(info.dead) { return 'no'; }
  if(Date.now() > deadline) { return 'timeout'; }
  let timedOut = false;
  let moves = chess.moves('object', false, false, false);
  if(info.hot.size > 0) {
    //Moves on boards involved in a check first: they are the likely way out
    let onHot = (m) => info.hot.has(m.start.timeline) || info.hot.has(m.end.timeline);
    moves = moves.filter(onHot).concat(moves.filter((m) => !onHot(m)));
  }
  for(let move of moves) {
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
