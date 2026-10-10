// Text descriptions for LLMs: a rules primer, every board of every timeline
// as a grid, and what the opponent threatens. Used by the text endpoints
// (and so by the MCP server), so any agent gets the same information.
import { createRequire } from 'node:module';
import { hasLegalAction, trimState } from '../../shared/legalMoves.js';

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
- Treat turn and timeline as two more axes next to the board's files and ranks.
  Pieces keep their movement pattern across all four axes: a rook slides along
  one axis, a bishop along two axes in equal steps, the queen and king in any
  combination (king one step), a knight goes 2 steps on one axis and 1 on another.
  One step in time = one full turn back (same player's board).
- You can move to the past (or to another timeline's board at the same turn),
  never to the future.
- Moving a piece to a PAST board does not change that board: it creates a NEW
  timeline that branches off from there. White's new timelines are L1, L2, ...;
  Black's are L-1, L-2, ...
- Moving to the latest board of another timeline (same time, it's your turn
  there) just moves the piece; no new timeline.

THE PRESENT AND YOUR TURN
- The "present" is the earliest turn among the latest boards of all active
  timelines. A turn (action) is one or more moves followed by submit: you must
  move on every present board where it is your turn. Other playable boards are
  optional.
- Creating a timeline in the past moves the present back in time, which forces
  the opponent to play on that new board first.
- A player may have at most one more active timeline than the opponent; extra
  ones are inactive and don't affect the present.

CHECK AND MATE
- You may not submit while any of your kings could be captured by the
  opponent's next move, on ANY board, including captures that travel through
  time or across timelines.
- Checkmate: you have no legal turn and are in check (you lose).
  Stalemate: no legal turn but not in check (draw).

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
  the list again.`;

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

// Piece standing on a square of a specific board (timeline, turn, player to move)
const pieceAt = (board, sq, player) => {
  const tl = board.timelines.find((t) => t.timeline === sq.timeline);
  if(!tl) { return null; }
  const turn = tl.turns.find((t) => t.turn === sq.turn && t.player === player);
  if(!turn) { return null; }
  return turn.pieces.find((p) => p.position.coordinate === sq.coordinate) || null;
};

const isTravel = (m) => m.start.timeline !== m.end.timeline || m.start.turn !== m.end.turn;

// What the opponent could do next if `chess`'s player made no move at all.
// Returns [{ move, kind: 'mate'|'check'|'capture', captured, travel }], most
// dangerous first. If you're already in check, those checks are the threats.
export const threats = (chess, budgetMs = 6000) => {
  const deadline = Date.now() + budgetMs;
  const probe = new Chess();
  probe.state(trimState(chess.state()));
  probe.skipDetection = true;
  const me = probe.player;
  const them = me === 'white' ? 'black' : 'white';

  if(probe.inCheck) {
    // Captures of our king(s) that exist right now
    return probe.checks('object').map((c) => ({
      move: `${them} piece on L${c.start.timeline} T${c.start.turn} ${c.start.coordinate} attacks your king on L${c.end.timeline} T${c.end.turn} ${c.end.coordinate}`,
      kind: 'check',
      captured: 'king',
      travel: c.start.timeline !== c.end.timeline || c.start.turn !== c.end.turn,
    }));
  }

  // Let the opponent move: submit the moves staged so far, or pass (empty action)
  try {
    if(probe.moveBuffer.length > 0 && probe.submittable()) { probe.submit(); }
    else { probe.pass(); }
  }
  catch(err) { return []; }
  const board = probe.board;
  const objects = probe.moves('object', false, false, false);
  const names = probe.moves('5dpgn', false, false, false).trim().split('\n');
  const res = [];
  for(let i = 0;i < objects.length;i++) {
    const m = objects[i];
    const target = pieceAt(board, m.end, them);
    const captured = target && target.player === me ? NAME[LETTER(target)] || 'piece' : null;
    let kind = captured ? 'capture' : null;
    let maybeMate = false; // mate search ran out of time
    // Does this move alone give check, or even mate? Only when it completes
    // the opponent's turn by itself (one present board), and while time lasts.
    if(Date.now() < deadline) {
      const next = probe.copy();
      next.move(m);
      if(next.submittable()) {
        next.submit();
        if(next.inCheck) {
          kind = 'check';
          const mate = Date.now() < deadline ? hasLegalAction(next, Math.min(2000, deadline - Date.now())) : 'timeout';
          if(mate === 'no') { kind = 'mate'; }
          else if(mate === 'timeout') { maybeMate = true; }
        }
      }
    }
    if(kind) {
      res.push({ move: names[i], kind, captured, travel: isTravel(m), maybeMate, value: captured ? VALUE[LETTER(target)] || 1 : 0 });
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
    return `- ${t.move}: ${what}${t.travel ? ' (time travel / other timeline)' : ''}`;
  };
  const mates = list.filter((t) => t.kind === 'mate');
  const lines = ['If you made no move, the opponent could play:'];
  if(mates.length) { lines.push(`!! ${mates.length} MATE THREAT${mates.length > 1 ? 'S' : ''}: your move must stop ${mates.length > 1 ? 'these' : 'this'}.`); }
  const shown = list.slice(0, 25);
  lines.push(...shown.map(line));
  if(list.length > shown.length) { lines.push(`... and ${list.length - shown.length} smaller captures`); }
  return lines.join('\n');
};
