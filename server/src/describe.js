// Text descriptions for LLMs: a rules primer, every board of every timeline
// as a grid, and what the opponent threatens. Used by the text endpoints
// (and so by the MCP server), so any agent gets the same information.
import { createRequire } from 'node:module';
import { trimState } from '../../shared/trimState.js';
import { hasLegalAction, completeAction } from '../../shared/legalMovesV3.js';
import { fixPawnCaptures } from '../../shared/notation.js';
import { Position } from '../../shared/fastPosition.js';
import * as enginePiece from '../../shared/engine/piece.js';
import * as boardFuncs from '../../shared/engine/board.js';

const require = createRequire(import.meta.url);
const Chess = require('5d-chess-js');

export const RULES = `5D CHESS WITH MULTIVERSE TIME TRAVEL: RULES PRIMER

Pieces move as in normal chess, but a game has two extra dimensions: time
(turns) and timelines. Read this once; the game state shows the rest.

BOARDS
- Every move makes a new board. A timeline is a row of boards in time order:
  T1w = turn 1 with White to move, T1b = turn 1 with Black to move, T2w, ...
- The game starts with one timeline, L0. You can only move from a "playable"
  board: the latest board of a timeline where it is your turn.

MOVING THROUGH TIME AND TIMELINES
- Treat turn and timeline as two more axes next to the board's files and ranks:
  the four axes are file, rank, time (one step = one full turn into the past),
  and timeline (one step = one neighboring timeline). Pieces keep their normal
  movement pattern, just measured across any of the four axes.
- PER PIECE, with examples (from a board at (0T9)):
  * Rook: slides along ONE axis. Rb1-b5 (rank), or Rb1>>(0T5)b1~ (4 steps
    straight back in time), or Rb1>(1T9)b1 (sideways one timeline).
  * Bishop: slides along TWO axes in EQUAL steps. c1-f4 (file+rank), or
    (0T9)Bc1>>(0T6)f1~ (3 files + 3 turns), or file+timeline, rank+timeline,
    time+timeline.
  * Unicorn: three axes equally; Dragon: all four axes equally.
  * Queen: any number of axes, equal steps. The famous mate pattern
    (0T9)Qf3>>x(0T5)f7~ is a "diagonal": 4 turns back + 4 ranks up.
  * King: like the queen but ONE step: Ke1>(1T9)e1, or Ke1>>(0T8)d1~
    (one turn back and one file over). Castling is normal-chess only.
  * Knight: 2 steps on one axis, 1 on another: Nf3>>(0T8)f1 reaches the
    board one turn back, two ranks down.
  * Pawn: forward one rank on its own board (two from the start), OR sideways
    one timeline in its color's direction (White toward Black's timelines
    L-1..., Black toward White's L1...; two timelines from its starting square
    if the square on the skipped timeline's board is empty). Pawns CAPTURE
    diagonally: rank+file as usual, or timeline+time. En passant works on one
    board as in chess.
- You can move to the past, or to another timeline's board at the same turn —
  never to the future. The destination board must EXIST and it must be a board
  where it is your color's move (same "turn parity" as your playable boards).
- Moving a piece to a PAST board (">>") does not change that board: it creates
  a NEW timeline branching from it, whose first board is a copy plus your
  arriving piece. White's new timelines are L1, L2, ...; Black's L-1, L-2, ...
- Moving to the latest board of another timeline at the same turn (">") just
  moves the piece there — no new timeline, and that single move counts as the
  move for BOTH boards (origin and destination).

THE PRESENT AND YOUR TURN
- The "present" is the earliest turn among the latest boards of all active
  timelines. A turn (action) is one or more moves followed by submit: you must
  move on every present board where it is your turn. Other playable boards are
  optional.
- WORKED EXAMPLE of one full turn with 3 active timelines (L-1, L0, L1), all
  present at T12 with you to move: you must make one move on each of the three
  boards, e.g. "(0T12)Nf3", "(-1T12)e5", "(1T12)Rd1", then submit (3 moves,
  one action). If instead your first move is a travel "(0T12)Qd3>>x(0T9)g6~",
  it creates a new timeline at T9: the present jumps back to T9, your other
  two T12 boards are no longer at the present, and you can submit immediately
  — the opponent must now answer on the new T9 board first.
- Creating a timeline in the past moves the present back in time ONLY if the
  new timeline is active (next bullet). An inactive branch changes nothing
  about whose turn it is where.
- A player may have at most one more ACTIVE timeline than the opponent; extra
  ones are inactive and don't affect the present. Creating timelines can also
  re-ACTIVATE a previously inactive opposing timeline (the window widens), and
  that timeline's old board may then pull the present far into the past.

CHECK AND MATE
- You may not submit while any of your kings could be captured by the
  opponent's next move, on ANY board, including captures that travel through
  time or across timelines.
- Checkmate: you have no legal turn and are in check (you lose).
  Stalemate: no legal turn but not in check (draw).

HARD-EARNED TRUTHS (games have been lost to each of these)
- Your king on a PAST board can be attacked: a queen on b7 at T15 can take a
  king that sat on the T11 board (file+time move); a knight can attack a king
  one turn back and two ranks over. Guard every board your king ever stood on.
- If your king time-travels, its ORIGIN timeline continues without that king
  (its older boards with the king remain attackable), and the destination
  branch now holds two of your kings. Every one of them must stay safe.
- A piece left behind on any old board stays capturable through time forever;
  moving the piece later does not undo the past copies.
- A move to the latest board of ANOTHER timeline ('>' without ~) advances BOTH
  timelines at once: the arriving piece counts as that board's move.
- Moves on playable boards ahead of the present are OPTIONAL but real: the
  opponent can answer the present AND capture something on a non-present board
  in the same turn.
- Notation: two identical pieces are disambiguated by file (Kef7 and Kgf7 are
  two different kings); pawn captures print as dxc6.

NOTATION (5DPGN), used for all moves
- One timeline: normal chess notation: e4, Nf3, exd5, O-O, e8=Q.
- With several timelines, moves start with the board they're made from:
  (L T), e.g. (0T5)Nf3 = knight move on timeline 0, turn 5.
- ">" = move to another timeline's board at the same time, ">>" = travel to the
  past (creates a new timeline), "x" = capture, "~" = new timeline created,
  "(>L1)" = the timeline it created. Example: (0T9)Qf3>>x(0T5)f7~ = queen goes
  from turn 9 back to turn 5 and captures on f7, making a new timeline.

READING THE BOARDS
- Uppercase = White, lowercase = Black, "." = empty. K king, Q queen, R rook,
  B bishop, N knight, P pawn (variants: S princess, W brawn, C common king,
  Y royal queen, U unicorn, D dragon).
- The timeline grid shows every board; boards in the same column are at the
  same moment in time. "*" marks a board you can move on now.

WHAT BEGINNERS MISS
- Past boards are part of the game. A piece of yours that is safe now may be
  capturable on an earlier board, and an enemy piece can arrive from the
  future: e.g. a queen that travels back and captures f7 next to your king,
  protected by its own earlier self, is checkmate.
- Always read the THREATS section: it lists what the opponent could do next,
  including time-travel captures and mate threats.
- Only play moves from the legal move list. It only contains moves that can be
  part of a legal turn; when a turn needs several moves, play one and look at
  the list again.

HOW TO PLAY WELL (strategy for an API player)
- Each turn: read THREATS first, pick 2-3 candidate moves, POST /preview on
  the best one to see the opponent's replies, then play and submit.
- Do NOT move on playable boards AHEAD of the present without a concrete
  tactical reason. The present will reach them anyway; moving early only gives
  the opponent information and commits your pieces for free. Answer the
  present boards and stop.
- Time travel is strongest as a THREAT and as a defensive resource. Every
  branch you create gives the opponent a whole new board to attack on, and
  branching when you are ahead on active timelines makes the branch inactive
  (often wasted). Travel with a purpose: capture something decisive, escape a
  mate, or shift the present to a board where you are winning.
- Guard the squares next to every king COPY, on every board and turn where it
  stood - most lost games die to a check delivered through time at an old
  board. f7/f2-style weaknesses exist in four dimensions.
- Material on old boards is real: a rook "left behind" three turns ago can be
  taken through time for profit. Conversely your past pieces defend your past
  kings.`;

const LETTER = (p) => (p.piece === '' ? 'P' : p.piece);
const VALUE = { K: 100, C: 100, Y: 100, Q: 9, S: 8, D: 7, U: 5, R: 5, B: 3, N: 3, W: 1, P: 1 };
const NAME = { K: 'king', C: 'common king', Y: 'royal queen', Q: 'queen', S: 'princess', D: 'dragon', U: 'unicorn', R: 'rook', B: 'bishop', N: 'knight', W: 'brawn', P: 'pawn' };

const boardRows = (turn) => {
  const grid = [];
  for(let r = 0;r < turn.height;r++) { grid.push(Array(turn.width).fill('.')); }
  for(const p of turn.pieces) {
    const l = LETTER(p);
    grid[turn.height - p.position.rank][p.position.file - 1] = p.player === 'white' ? l.toUpperCase() : l.toLowerCase();
  }
  return grid.map((row) => row.join(''));
};

// Structured board data: one walk over the parsed multiverse.
// Boards are immutable once their turn is over, so (L, turn, side) is a
// stable name and the content hash changes only for staged (uncommitted) work.
export const boardsData = (chess, you = null) => {
  const board = chess.board;
  const timelines = [...board.timelines].sort((a, b) => a.timeline - b.timeline);
  const res = { width: board.width || 8, height: board.height || 8, timelines: [] };
  for(const tl of timelines) {
    const latest = tl.turns[tl.turns.length - 1];
    const entry = {
      L: tl.timeline,
      active: tl.active,
      present: tl.present,
      toMove: latest.player,
      latestLabel: `T${latest.turn}${latest.player[0]}`,
      boards: [],
    };
    for(const t of tl.turns) {
      const rows = boardRows(t);
      let h = 0x811c9dc5 | 0;
      for(const row of rows) {
        for(let i = 0;i < row.length;i++) { h = Math.imul(h ^ row.charCodeAt(i), 0x01000193); }
      }
      entry.boards.push({
        key: `${tl.timeline}:${t.turn}${t.player[0]}`,
        label: `L${tl.timeline} T${t.turn}${t.player[0]}`,
        turn: t.turn,
        player: t.player,
        latest: t === latest,
        playable: t === latest && you !== null && t.player === you,
        rows,
        hash: h >>> 0,
      });
    }
    res.timelines.push(entry);
  }
  return res;
};

// One board as text (used for the micro-grids and the fetch-one-board API)
export const renderBoard = (b, height) => {
  const out = [`${b.label}${b.playable ? ' (you can move here)' : b.latest ? ` (latest of its timeline, ${b.player} to move)` : ''}`];
  b.rows.forEach((row, i) => out.push(`${height - i} ${row.split('').join(' ')}`));
  out.push('  ' + 'abcdefgh'.slice(0, b.rows[0].length).split('').join(' '));
  return out.join('\n');
};

// Compact overview: every board of every timeline by name only.
// `shown` boards are the ones whose full grid accompanies this overview.
export const macroGrid = (data, shown = null) => {
  const out = ['All boards by name (one row per timeline; * = you can move there' + (shown ? ', # = full board shown below' : '') + '):'];
  for(const tl of data.timelines) {
    const tags = [tl.active ? 'active' : 'inactive'];
    if(tl.present) { tags.push('present'); }
    const cells = tl.boards.map((b) => `T${b.turn}${b.player[0]}${b.playable ? '*' : ''}${shown && shown.has(b.key) ? '#' : ''}`);
    out.push(`L${tl.L} (${tags.join(', ')}): ${cells.join(' ')}`);
  }
  return out.join('\n');
};

// Every board of every timeline. Rows = timelines, columns = moments in time
// (aligned, so boards in one column are simultaneous).
export const timelineGrid = (chess, you = null) => {
  const board = chess.board;
  const timelines = [...board.timelines].sort((a, b) => a.timeline - b.timeline);
  const col = (t) => t.turn * 2 + (t.player === 'black' ? 1 : 0);
  let minCol = Infinity;
  let maxCol = -Infinity;
  for(const tl of timelines) {
    for(const t of tl.turns) { minCol = Math.min(minCol, col(t)); maxCol = Math.max(maxCol, col(t)); }
  }
  const width = board.width || 8;
  const height = board.height || 8;
  const cellW = width + 2;
  const out = [];
  for(const tl of timelines) {
    const latest = tl.turns[tl.turns.length - 1];
    const tags = [tl.active ? 'active' : 'inactive'];
    if(tl.present) { tags.push('in the present'); }
    out.push(`Timeline L${tl.timeline} (${tags.join(', ')}; latest board T${latest.turn}${latest.player[0]}, ${latest.player} to move)`);
    const cells = new Map(tl.turns.map((t) => [col(t), t]));
    const header = [];
    const rows = Array.from({ length: height }, () => []);
    for(let c = minCol;c <= maxCol;c++) {
      const t = cells.get(c);
      if(!t) {
        header.push(' '.repeat(cellW));
        rows.forEach((r) => r.push(' '.repeat(cellW)));
        continue;
      }
      const playable = t === latest && you && t.player === you && tl.active !== undefined;
      header.push(`T${t.turn}${t.player[0]}${playable ? '*' : ''}`.padEnd(cellW));
      boardRows(t).forEach((line, i) => rows[i].push(line + '  '));
    }
    out.push('   ' + header.join('').trimEnd());
    rows.forEach((r, i) => out.push(`${height - i}  ${r.join('').trimEnd()}`));
    out.push('');
  }
  out.push(`(files a-${'abcdefghijklmnop'[width - 1]} left to right in each board; rank numbers on the left)`);
  return out.join('\n');
};

const isTravelRaw = (m) => m[0][0] !== m[1][0] || m[0][1] !== m[1][1];

// Display helpers over raw internal coordinates [l, t, rank, file] (slot
// index, half-turn, 0-based). Odd-timeline variants only; even variants
// ("-0"/"+0") skip the analyses that use these.
const slotToSigned = (l) => (l === 0 ? 0 : l % 2 === 1 ? -(l + 1) / 2 : l / 2);
const signedToSlot = (n) => (n === 0 ? 0 : n > 0 ? 2 * n : -2 * n - 1);
const dispPos = (p, turnOffset) =>
  `L${slotToSigned(p[0])} T${Math.floor(p[1] / 2) + turnOffset} ${'abcdefghijklmnop'[p[3]]}${p[2] + 1}`;

// Raw half-turn index -> displayed turn number offset: displayed turn =
// floor(rawT / 2) + offset (1 for standard, 0 for turn-zero variants).
// Read off timeline 0: its first parsed turn vs its first raw board index.
const turnOffsetOf = (chess, root) => {
  try {
    const tl0 = chess.board.timelines.find((tl) => tl.timeline === 0) || chess.board.timelines[0];
    const raw0 = root.board[signedToSlot(tl0.timeline)];
    const t0raw = raw0.findIndex((b) => b);
    return tl0.turns[0].turn - Math.floor(t0raw / 2);
  }
  catch { return 1; }
};

// Our kings attacked in `pos` (the side to move), as display strings
const kingsAttackedOf = (pos, turnOffset) => {
  const seen = new Set();
  for(const [, king] of pos.checksList()) { seen.add(dispPos(king, turnOffset)); }
  return [...seen];
};

// Squares a sliding move passes through, strictly between source and dest,
// in the same raw frame as the move; [] for leapers/one-steppers.
const rayCrossings = (m) => {
  const dL = slotToSigned(m[1][0]) - slotToSigned(m[0][0]);
  const dT = (m[1][1] - m[0][1]) / 2;
  const dR = m[1][2] - m[0][2];
  const dF = m[1][3] - m[0][3];
  const steps = Math.max(Math.abs(dL), Math.abs(dT), Math.abs(dR), Math.abs(dF));
  if(steps <= 1) { return []; }
  for(const v of [dL, dT, dR, dF]) {
    if(v !== 0 && Math.abs(v) !== steps) { return []; } //leaper (knight)
  }
  const u = [Math.sign(dL), Math.sign(dT), Math.sign(dR), Math.sign(dF)];
  const out = [];
  let cur = [slotToSigned(m[0][0]), m[0][1], m[0][2], m[0][3]];
  for(let k = 1;k < steps;k++) {
    cur = [cur[0] + u[0], cur[1] + 2 * u[1], cur[2] + u[2], cur[3] + u[3]];
    out.push([signedToSlot(cur[0]), cur[1], cur[2], cur[3]]);
  }
  return out;
};

// What the opponent could do next if `chess`'s player made no move at all.
// Returns [{ move, kind: 'mate'|'check'|'capture', captured, travel }], most
// dangerous first. If you're already in check, those checks are the threats.
// Per-move analysis runs on the fast engine (shared/fastPosition); only the
// 5DPGN naming of opponent moves still goes through 5d-chess-js.
export const threats = (chess, budgetMs = 6000) => {
  const deadline = Date.now() + budgetMs;
  const root = Position.fromChess(chess);
  const me = root.player;
  const them = me === 'white' ? 'black' : 'white';
  const myParity = root.action % 2;

  if(root.inCheck()) {
    // Captures of our king(s) that exist right now (named via the parsed engine)
    return chess.checks('object').map((c) => ({
      move: `${them} piece on L${c.start.timeline} T${c.start.turn} ${c.start.coordinate} attacks your king on L${c.end.timeline} T${c.end.turn} ${c.end.coordinate}`,
      kind: 'check',
      captured: 'king',
      travel: c.start.timeline !== c.end.timeline || c.start.turn !== c.end.turn,
    }));
  }

  // Let the opponent move: count the staged moves as played if they complete
  // the turn, otherwise pretend we pass on every remaining present board
  const base = (chess.moveBuffer.length > 0 && root.submittable()) ? root.submit() : root.pass();
  if(!base) { return []; }
  const rawMoves = base.moves();
  // 5DPGN names for the same move list (same generator, same order)
  const nameProbe = new Chess();
  nameProbe.state(trimState(chess.state()));
  nameProbe.skipDetection = true;
  if(chess.moveBuffer.length > 0 && root.submittable()) { nameProbe.submit(); }
  else { nameProbe.pass(); }
  const names = nameProbe.moves('5dpgn', false, false, false).trim().split('\n').map(fixPawnCaptures);

  // Avoidability inputs, valid only in the simple frame: no staged moves (so
  // `base` is root.pass() and pass-created boards map back to our live tips)
  // and an odd-timeline variant (signed-slot arithmetic).
  const isEven = boardFuncs.isEvenTimeline(root.board);
  const simpleFrame = chess.moveBuffer.length === 0 && !isEven;
  const turnOffset = turnOffsetOf(chess, root);
  const rootTips = root.board.map((tl) => (tl ? tl.length - 1 : -1));
  // base-frame square -> root-frame square we could reach, or null if frozen
  const toRootSquare = ([l, t, r, f]) => {
    if(rootTips[l] === undefined || rootTips[l] < 0) { return null; }
    return t > rootTips[l] ? [l, rootTips[l], r, f] : [l, t, r, f];
  };
  const key = (p) => p.join(',');
  const ourDests = simpleFrame ? new Set(root.moves().map((mv) => key(mv[1]))) : null;

  const res = [];
  for(let i = 0;i < rawMoves.length;i++) {
    const m = rawMoves[i];
    const dest = m[1];
    const destBoard = base.board[dest[0]] && base.board[dest[0]][dest[1]];
    const targetInt = destBoard ? Math.abs(destBoard[dest[2]][dest[3]]) : 0;
    const targetChar = targetInt !== 0 && targetInt % 2 === myParity ? enginePiece.toChar(targetInt, true) : null;
    const captured = targetChar ? NAME[targetChar] || 'piece' : null;
    let kind = captured ? 'capture' : null;
    let mate; // true | false | 'unknown' (only set on checking actions)
    let maybeMate = false; // mate search ran out of time
    let withMoves; // the other moves of the completed action (5DPGN names)
    let kingsAttacked;
    // Complete the move into a full action (all present boards answered):
    // single-move fast path, else the hypercuboid completes it. A move that
    // fits NO legal action is not a threat at all.
    if(Date.now() < deadline) {
      let after = null;
      const next = base.clone().apply(m);
      if(next.submittable()) { after = next.submit(); }
      else {
        const comp = completeAction(base, i, Math.min(800, deadline - Date.now()));
        if(comp.result === 'no') { continue; }
        if(comp.result === 'yes') {
          let cur = base.clone();
          for(const id of comp.moves) { cur = cur.apply(rawMoves[id]); }
          if(cur.submittable()) {
            after = cur.submit();
            withMoves = comp.moves.filter((id) => id !== i).map((id) => names[id]);
            if(withMoves.length === 0) { withMoves = undefined; }
          }
        }
      }
      if(after && after.inCheck()) {
        kind = 'check';
        //display strings use signed-slot arithmetic: odd variants only
        if(!isEven) { kingsAttacked = kingsAttackedOf(after, turnOffset); }
        const verdict = Date.now() < deadline ? hasLegalAction(after, Math.min(2000, deadline - Date.now())) : 'timeout';
        if(verdict === 'no') { kind = 'mate'; mate = true; }
        else if(verdict === 'timeout') { maybeMate = true; mate = 'unknown'; }
        else { mate = false; }
      }
    }
    if(kind) {
      // avoidable:false is a PROOF: the captured piece is frozen on a past
      // board, no move of ours captures the attacker (its square on our live
      // boards), and no move of ours can block the ray. avoidable:true: the
      // target is on a live board we could still move.
      //only for plain captures: on a check/mate the flag would read as
      //"the mate is unavoidable", which this analysis does not prove
      let avoidable;
      if(captured && kind === 'capture' && simpleFrame) {
        const targetFrozen = dest[1] <= rootTips[dest[0]];
        if(!targetFrozen) { avoidable = true; }
        else {
          const att = toRootSquare(m[0]);
          const canCapture = att !== null && ourDests.has(key(att));
          const canBlock = rayCrossings(m).some((c) => {
            const rc = toRootSquare(c);
            return rc !== null && ourDests.has(key(rc));
          });
          if(!canCapture && !canBlock) { avoidable = false; }
        }
      }
      res.push({
        move: names[i], with: withMoves, kind, mate, captured, avoidable,
        kingsAttacked, travel: isTravelRaw(m), maybeMate,
        value: captured ? VALUE[targetChar] || 1 : 0,
      });
    }
  }
  const rank = { mate: 3, check: 2, capture: 1 };
  res.sort((a, b) => rank[b.kind] - rank[a.kind] || (b.maybeMate - a.maybeMate) || b.value - a.value);
  return res.map(({ value, ...t }) => t);
};

export const threatsText = (list, inCheck) => {
  if(inCheck) {
    return ['YOU ARE IN CHECK. Your turn must remove every one of these:', ...list.map((t) => `- ${t.move}${t.travel ? ' (through time/timelines)' : ''}`)].join('\n');
  }
  if(list.length === 0) { return 'No captures, checks or mates available to the opponent right now.'; }
  const line = (t) => {
    const what = t.kind === 'mate' ? 'CHECKMATE' :
      t.kind === 'check' ? `check${t.maybeMate ? ' (could be mate, not checked fully)' : ''}${t.captured ? `, takes your ${t.captured}` : ''}` :
      `takes your ${t.captured}`;
    const parts = [`- ${t.move}: ${what}`];
    if(t.with && t.with.length) { parts.push(` (as the full action ${[t.move, ...t.with].join(' / ')})`); }
    if(t.kingsAttacked && t.kingsAttacked.length) { parts.push(` [kings attacked: ${t.kingsAttacked.join(', ')}]`); }
    if(t.avoidable === false) { parts.push(' [UNAVOIDABLE: the piece is frozen on a past board and you can neither capture the attacker nor block the path - do not waste moves defending it]'); }
    if(t.travel) { parts.push(' (time travel / other timeline)'); }
    return parts.join('');
  };
  const mates = list.filter((t) => t.kind === 'mate');
  const lines = ['If you made no move, the opponent could play (each line is one move; where it alone would not answer every present board, "full action" shows one way the opponent completes the turn):'];
  if(mates.length) { lines.push(`!! ${mates.length} MATE THREAT${mates.length > 1 ? 'S' : ''}: your move must stop ${mates.length > 1 ? 'these' : 'this'}.`); }
  // Mates and checks are never truncated (a hidden one once cost a game);
  // only plain captures past the cap are summarized.
  const dangers = list.filter((t) => t.kind !== 'capture');
  const captures = list.filter((t) => t.kind === 'capture');
  const shown = [...dangers, ...captures.slice(0, 40)];
  lines.push(...shown.map(line));
  if(list.length > shown.length) { lines.push(`... and ${list.length - shown.length} smaller captures`); }
  return lines.join('\n');
};
