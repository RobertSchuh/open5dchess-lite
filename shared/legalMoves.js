//Legal move hints and mate/stalemate detection, fast engine.
//
//Same algorithm and same results as shared/legalMovesReference.js (the
//original, kept for differential tests), but running on shared/fastPosition
//instead of full 5d-chess-js instances. See fastPosition.js for what makes
//it fast; the search itself is unchanged:
//
//In 5D chess a single move is never legal or illegal on its own: what counts
//is the whole action (all moves until submit). An action can be submitted
//when no king is in check and every present board has been moved on. So a
//move is 'legal' here if there is at least one way to continue the action
//after it that ends in a submittable position.
//
//Results per move:
//  'legal'   - found a continuation that can be submitted
//  'illegal' - searched every continuation, none can be submitted
//  'unknown' - ran out of time (treated like 'legal' by the UI, so a legal
//              move is never hidden)
import { Position } from './fastPosition.js';

export { trimState } from './legalMovesReference.js';

//Accept a live Chess instance, a serialized chess.state(), or a Position
const toPosition = (input) => {
  if(input instanceof Position) { return input; }
  if(input && input.rawBoard) { return Position.fromState(input); }
  return Position.fromChess(input);
};

//Looks at the current checks. `dead`: some check can never be removed this
//action. That holds for a check on a single board (attacker and king on the
//same board) once that board's latest state has the opponent to move: we
//can't move there again, and moves on other boards can't change it.
//(In raw terms: check detection extends present timelines by a blank board;
//an attacker on a board that is still the REAL latest of its timeline sits
//on an opponent-parity board we can no longer move on.)
//`hot`: timeline indices that still have a live check, to try their moves first.
const checkInfo = (pos) => {
  const checks = pos.checksList();
  const res = { dead: false, hot: new Set() };
  if(checks.length === 0) { return res; }
  for(const c of checks) {
    const start = c[0];
    const end = c[1];
    const sameBoard = start[0] === end[0] && start[1] === end[1];
    const realLatest = pos.board[start[0]] ? pos.board[start[0]].length - 1 : -1;
    if(sameBoard && start[1] === realLatest) {
      res.dead = true;
      return res;
    }
    res.hot.add(start[0]);
    res.hot.add(end[0]);
  }
  return res;
};

//Depth-first search for any submittable continuation of the current action.
//Moves on different boards can be made in any order, so positions reached
//twice (same content hash) are skipped.
const canComplete = (pos, deadline, seen) => {
  if(pos.submittable()) { return 'yes'; }
  const info = checkInfo(pos);
  if(info.dead) { return 'no'; }
  if(Date.now() > deadline) { return 'timeout'; }
  let timedOut = false;
  let moves = pos.moves();
  if(info.hot.size > 0) {
    //Moves on boards involved in a check first: they are the likely way out
    const onHot = (m) => info.hot.has(m[0][0]) || info.hot.has(m[1][0]);
    moves = moves.filter(onHot).concat(moves.filter((m) => !onHot(m)));
  }
  for(const move of moves) {
    const next = pos.clone().apply(move);
    const hash = next.hash();
    if(seen.has(hash)) { continue; }
    seen.add(hash);
    const res = canComplete(next, deadline, seen);
    if(res === 'yes') { return 'yes'; }
    if(res === 'timeout') { timedOut = true; }
  }
  return timedOut ? 'timeout' : 'no';
};

//Classify every move of chess.moves('object', false, false, false), same
//order (the fast engine generates the identical move list).
export const classifyMoves = (input, totalBudgetMs = 4000, perMoveBudgetMs = 500) => {
  const root = toPosition(input);
  const end = Date.now() + totalBudgetMs;
  const res = [];
  for(const move of root.moves()) {
    const next = root.clone().apply(move);
    const deadline = Math.min(end, Date.now() + perMoveBudgetMs);
    const found = canComplete(next, deadline, new Set());
    res.push(found === 'yes' ? 'legal' : found === 'no' ? 'illegal' : 'unknown');
  }
  return res;
};

//Does the player to move have any legal action at all? 'yes' | 'no' | 'timeout'.
//'no' means checkmate (if in check) or stalemate.
export const hasLegalAction = (input, budgetMs = 10000) => {
  return canComplete(toPosition(input), Date.now() + budgetMs, new Set());
};
