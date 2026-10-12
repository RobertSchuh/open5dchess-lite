// Text descriptions for LLMs: a rules primer, every board of every timeline
// as a grid, and what the opponent threatens. Used by the text endpoints
// (and so by the MCP server), so any agent gets the same information.
import { createRequire } from 'node:module';
import { trimState } from '../../shared/trimState.js';
import { hasLegalAction } from '../../shared/legalMovesV3.js';
import { fixPawnCaptures } from '../../shared/notation.js';
import { Position } from '../../shared/fastPosition.js';
import * as enginePiece from '../../shared/engine/piece.js';

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
  const res = [];
  for(let i = 0;i < rawMoves.length;i++) {
    const m = rawMoves[i];
    const dest = m[1];
    const destBoard = base.board[dest[0]] && base.board[dest[0]][dest[1]];
    const targetInt = destBoard ? Math.abs(destBoard[dest[2]][dest[3]]) : 0;
    const targetChar = targetInt !== 0 && targetInt % 2 === myParity ? enginePiece.toChar(targetInt, true) : null;
    const captured = targetChar ? NAME[targetChar] || 'piece' : null;
    let kind = captured ? 'capture' : null;
    let maybeMate = false; // mate search ran out of time
    // Does this move alone give check, or even mate? Only when it completes
    // the opponent's turn by itself (one present board), and while time lasts.
    if(Date.now() < deadline) {
      const next = base.clone().apply(m);
      if(next.submittable()) {
        const after = next.submit();
        if(after.inCheck()) {
          kind = 'check';
          const mate = Date.now() < deadline ? hasLegalAction(after, Math.min(2000, deadline - Date.now())) : 'timeout';
          if(mate === 'no') { kind = 'mate'; }
          else if(mate === 'timeout') { maybeMate = true; }
        }
      }
    }
    if(kind) {
      res.push({ move: names[i], kind, captured, travel: isTravelRaw(m), maybeMate, value: captured ? VALUE[targetChar] || 1 : 0 });
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
  // Mates and checks are never truncated (a hidden one once cost a game);
  // only plain captures past the cap are summarized.
  const dangers = list.filter((t) => t.kind !== 'capture');
  const captures = list.filter((t) => t.kind === 'capture');
  const shown = [...dangers, ...captures.slice(0, 40)];
  lines.push(...shown.map(line));
  if(list.length > shown.length) { lines.push(`... and ${list.length - shown.length} smaller captures`); }
  return lines.join('\n');
};
