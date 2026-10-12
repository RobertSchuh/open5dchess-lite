// One game: two seats (white/black) plus spectators, the rules engine,
// an optional clock, and change notifications. Everything lives in memory.
import { createRequire } from 'node:module';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { classifyMoves, hasLegalAction, trimState } from '../../shared/legalMoves.js';
import { Position } from '../../shared/fastPosition.js';
import { pool } from './analysisPool.js';
import { threats, threatsText, timelineGrid, boardsData, renderBoard, macroGrid } from './describe.js';

const require = createRequire(import.meta.url);
const Chess = require('5d-chess-js');
const ChessClock = require('5d-chess-clock');

export const VARIANTS = ['standard', 'defended_pawn', 'half_reflected', 'princess', 'turn_zero', 'two_timelines', 'reversed_royalty'];

// Search budgets (ms). The engine's own mate search reports "mate" when it
// times out, so the server uses shared/legalMoves.js instead.
// Mate detection first runs inline with the quick budget (covers almost all
// positions and keeps results synchronous); only slow positions go to the
// worker pool with the full budget.
const END_SEARCH_MS = 10000;
const END_QUICK_MS = Number(process.env.END_QUICK_MS || 250);
const LEGAL_MOVES_MS = 4000;

export class GameError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const newToken = () => randomBytes(16).toString('base64url'); // 128 bit

// Constant-time token comparison
const tokenEquals = (a, b) => {
  if(typeof a !== 'string' || typeof b !== 'string') { return false; }
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};

const other = (color) => color === 'white' ? 'black' : 'white';

export class Game {
  constructor({ id, variant = 'standard', timeControl = null, now = Date.now, endQuickMs = END_QUICK_MS }) {
    if(!VARIANTS.includes(variant)) {
      throw new GameError(400, `Unknown variant "${variant}". Use one of: ${VARIANTS.join(', ')}`);
    }
    this.id = id;
    this.variant = variant;
    this.now = now;
    this.createdAt = now();
    this.lastActivity = this.createdAt;
    this.endedAt = null;
    this.result = null; // { winner: 'white'|'black'|'draw', reason }
    this.version = 0;   // bumped on every change; used by long-polling
    this.seats = {
      white: { token: newToken(), nickname: null, connections: 0, lastSeen: 0 },
      black: { token: newToken(), nickname: null, connections: 0, lastSeen: 0 },
    };
    this.spectateToken = newToken();
    this.listeners = new Set();

    // Validation stays on (skipDetection = false): with it off, move() accepts anything.
    this.chess = new Chess();
    this.chess.reset(variant);

    this.timeControl = null;
    this.clock = null;
    this.flagTimer = null;
    if(timeControl) {
      try {
        // Not `new ChessClock(timeControl)`: it JSON-parses "1" into a number
        // and then resets without the time control.
        this.clock = new ChessClock();
        this.clock.reset(String(timeControl));
      }
      catch(err) {
        throw new GameError(400, `Invalid time control "${timeControl}"`);
      }
      if(!(this.clock.state().startingDuration > 0)) {
        throw new GameError(400, `Invalid time control "${timeControl}"`);
      }
      this.timeControl = timeControl;
    }
    this.legalCache = null;
    this.endQuickMs = endQuickMs;
    // First version at which each board (by name + content) was rendered;
    // lets clients fetch only boards new since their last look (boards are
    // immutable once their turn is over, so names are stable references)
    this.boardStamps = new Map();
  }

  // Which seat does this token belong to? 'white' | 'black' | 'spectator' | null
  seatFor(token) {
    let res = null;
    // Compare against every token (no early exit) so timing reveals nothing
    if(tokenEquals(token, this.seats.white.token)) { res = 'white'; }
    if(tokenEquals(token, this.seats.black.token)) { res = 'black'; }
    if(tokenEquals(token, this.spectateToken)) { res = res || 'spectator'; }
    // Any authenticated use of a seat counts as presence, so players on the
    // HTTP text API (LLMs via MCP) don't show as "not connected" all game.
    if(res === 'white' || res === 'black') { this.seats[res].lastSeen = Date.now(); }
    return res;
  }

  seatPresent(color) {
    const s = this.seats[color];
    return s.connections > 0 || Date.now() - s.lastSeen < 120000;
  }

  get ended() { return this.result !== null; }
  get player() { return this.chess.player; }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  changed() {
    this.version++;
    this.lastActivity = this.now();
    this.legalCache = null;
    this.threatCache = null;
    for(const fn of [...this.listeners]) {
      try { fn(this); } catch(err) { console.error(err); }
    }
  }

  requireTurn(seat) {
    if(this.ended) { throw new GameError(409, 'Game is over'); }
    if(seat !== 'white' && seat !== 'black') { throw new GameError(403, 'Spectators cannot play'); }
    this.updateClock();
    if(this.ended) { throw new GameError(409, 'Game is over (time)'); }
    if(seat !== this.player) { throw new GameError(409, `Not your turn (${this.player} to move)`); }
  }

  // input: 5DPGN move string (e.g. "e4", "(0T7)Qc7>>x(0T2)c2~") or engine move object
  move(seat, input) {
    this.requireTurn(seat);
    try {
      this.chess.move(input);
    }
    catch(err) {
      throw new GameError(400, `Illegal move: ${typeof input === 'string' ? input : JSON.stringify(input)}`);
    }
    this.changed();
  }

  undo(seat) {
    this.requireTurn(seat);
    if(!this.chess.undoable()) { throw new GameError(409, 'Nothing to undo'); }
    this.chess.undo();
    this.changed();
  }

  submit(seat) {
    this.requireTurn(seat);
    // Cheap checks first; the engine's own submit() would also run its slow mate search
    if(this.chess.inCheck) { throw new GameError(409, 'Cannot submit: your king is still in check'); }
    if(!this.chess.submittable()) {
      throw new GameError(409, 'Cannot submit: every present board must be moved on first');
    }
    const skip = this.chess.skipDetection;
    this.chess.skipDetection = true;
    try {
      this.chess.submit();
    }
    finally {
      this.chess.skipDetection = skip;
    }
    if(this.clock) {
      const clock = this.clock;
      if(!clock.state().running && clock.state().lastUpdate < 0) {
        // First submit starts the clock; time is added for the player now to move
        clock.state({ player: this.player });
        clock.start(this.chess.board);
      }
      else {
        clock.switch(this.player, this.chess.board);
      }
    }
    this.detectEnd();
    this.scheduleFlag();
    this.changed();
  }

  // Mate/stalemate: does the player now to move have any legal action?
  // Quick inline check first (fast engine, no copies); if the position is
  // too deep for the quick budget, the full search runs in the worker pool
  // and the game ends asynchronously when the verdict arrives.
  detectEnd() {
    const probe = Position.fromChess(this.chess);
    const quick = hasLegalAction(probe, this.endQuickMs);
    if(quick === 'yes') { return; }
    const loser = this.player;
    const inCheck = probe.inCheck();
    const finish = () => {
      if(this.ended) { return; }
      if(inCheck) { this.end(other(loser), 'checkmate'); }
      else { this.end('draw', 'stalemate'); }
    };
    if(quick === 'no') { finish(); return; }
    // The verdict is about this exact submit; staged moves by the opponent
    // meanwhile don't change it, and end() is a no-op if the game ended
    // another way first (resign, time).
    pool.run('hasLegalAction', trimState(this.chess.state()), [END_SEARCH_MS], END_SEARCH_MS)
      .then((res) => {
        if(res === 'no') {
          finish();
          this.changed();
        }
      })
      .catch(() => {});
  }

  resign(seat) {
    if(this.ended) { throw new GameError(409, 'Game is over'); }
    if(seat !== 'white' && seat !== 'black') { throw new GameError(403, 'Spectators cannot resign'); }
    this.end(other(seat), 'resignation');
    this.changed();
  }

  // Fresh game in place: same id, links and settings, colors swapped.
  // Either player can start it once the game is over.
  rematch(seat) {
    if(!this.ended) { throw new GameError(409, 'The game is not over yet'); }
    if(seat !== 'white' && seat !== 'black') { throw new GameError(403, 'Spectators cannot start a rematch'); }
    // The whole seat objects trade places (token, nickname, connections),
    // so everyone keeps their link and plays the other color. Callers must
    // re-resolve tokens to colors after this.
    const w = this.seats.white;
    this.seats.white = this.seats.black;
    this.seats.black = w;
    this.result = null;
    this.endedAt = null;
    this.chess = new Chess();
    this.chess.reset(this.variant);
    if(this.timeControl) {
      // Same construction as in the constructor (new ChessClock(tc) mis-parses)
      this.clock = new ChessClock();
      this.clock.reset(String(this.timeControl));
    }
    // Board names repeat across games; stale stamps would hide the new
    // boards from clients fetching with ?since=
    this.boardStamps = new Map();
    this.changed();
  }

  end(winner, reason) {
    if(this.ended) { return; }
    this.result = { winner, reason };
    this.endedAt = this.now();
    if(this.clock) { this.clock.stop(); }
    clearTimeout(this.flagTimer);
  }

  // Server-authoritative clock: flag the player to move when their time is up
  updateClock() {
    if(!this.clock || this.ended) { return; }
    const s = this.clock.state();
    if(s.lastUpdate >= 0 && s[`${s.player}DurationLeft`] <= 0) {
      this.end(other(s.player), 'time');
      this.changed();
    }
  }
  scheduleFlag() {
    clearTimeout(this.flagTimer);
    if(!this.clock || this.ended) { return; }
    const s = this.clock.state();
    if(!s.running) { return; }
    const left = s[`${s.player}DurationLeft`] + s[`${s.player}DelayLeft`];
    this.flagTimer = setTimeout(() => this.updateClock(), Math.max(left, 0) + 50);
    this.flagTimer.unref?.();
  }

  setNickname(seat, nickname) {
    if(seat !== 'white' && seat !== 'black') { return; }
    const clean = String(nickname || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24);
    this.seats[seat].nickname = clean || null;
    this.changed();
  }

  connect(seat) {
    if(this.seats[seat]) { this.seats[seat].connections++; this.changed(); }
  }
  disconnect(seat) {
    if(this.seats[seat]) { this.seats[seat].connections = Math.max(0, this.seats[seat].connections - 1); this.changed(); }
  }

  // Shared state for the web client (it replays the actions into its own engine)
  publicState(seat) {
    this.updateClock();
    return {
      id: this.id,
      version: this.version,
      variant: this.variant,
      timeControl: this.timeControl,
      you: seat,
      player: this.player,
      actionNumber: this.chess.actionNumber,
      actionHistory: this.chess.actionHistory,
      moveBuffer: this.chess.moveBuffer,
      clock: this.clock ? Object.assign(this.clock.state(), { serverTime: this.now() }) : null,
      result: this.result,
      players: {
        white: { nickname: this.seats.white.nickname, connected: this.seatPresent('white') },
        black: { nickname: this.seats.black.nickname, connected: this.seatPresent('black') },
      },
    };
  }

  // Moves for the player to move that can still lead to a submittable action.
  // Classification runs in the worker pool; concurrent callers share one job.
  // -> { moves, unverified } where `unverified` counts moves the search
  // could not prove within budget (kept in the list: never hide a possibly
  // legal move, but callers must not present them as proven).
  async legalMoves() {
    if(this.ended) { return { moves: [], unverified: 0 }; }
    if(this.legalCache && this.legalCache.version === this.version) { return this.legalCache.promise; }
    // Names via 5d-chess-js (needs skipDetection off its mate gating), classes
    // via the fast engine; both lists come from the same generator in the same
    // order.
    const skip = this.chess.skipDetection;
    this.chess.skipDetection = true;
    let names;
    try { names = this.chess.moves('5dpgn', false, false, false).trim().split('\n').filter(Boolean); }
    finally { this.chess.skipDetection = skip; }
    const version = this.version;
    const promise = pool.run('classify', trimState(this.chess.state()), [LEGAL_MOVES_MS], LEGAL_MOVES_MS)
      .then((classes) => {
        const res = {
          moves: names.filter((n, i) => classes[i] !== 'illegal'),
          unverified: classes.filter((c) => c === 'unknown').length,
        };
        // A completed classification with no surviving move is a full
        // mate/stalemate proof, even where the dedicated end search timed out.
        if(res.moves.length === 0 && res.unverified === 0 && !this.ended && this.version === version
          && this.chess.moveBuffer.length === 0) { //only a clean position proves mate (not mid-action)
          if(this.chess.inCheck) { this.end(other(this.player), 'checkmate'); }
          else { this.end('draw', 'stalemate'); }
          this.changed();
        }
        return res;
      });
    this.legalCache = { version: this.version, promise };
    return promise;
  }

  // 5DPGN names of the moves staged this action. The engine's export leaves
  // the move buffer out, so rewind a copy and name each move as it's replayed.
  stagedMoves() {
    const buffer = this.chess.moveBuffer;
    if(buffer.length === 0) { return []; }
    const probe = new Chess();
    probe.state(trimState(this.chess.state()));
    probe.skipDetection = true;
    while(probe.undoable()) { probe.undo(); }
    const same = (a, b) => JSON.stringify([a.start, a.end, a.promotion]) === JSON.stringify([b.start, b.end, b.promotion]);
    const names = [];
    for(const move of buffer) {
      const objects = probe.moves('object', false, false, false);
      const strings = probe.moves('5dpgn', false, false, false).trim().split('\n');
      const i = objects.findIndex((o) => same(o, move));
      names.push(i >= 0 ? strings[i] : '?');
      probe.move(move);
    }
    return names;
  }

  // What the opponent could do next (only meaningful on your turn); cached
  // per position, computed in the worker pool
  async currentThreats() {
    if(this.ended) { return []; }
    if(this.threatCache && this.threatCache.version === this.version) { return this.threatCache.promise; }
    const promise = pool.run('threats', trimState(this.chess.state()), [], 8000);
    this.threatCache = { version: this.version, promise };
    return promise;
  }

  // "If I play these moves, what can the opponent do?" Nothing is changed.
  async preview(seat, moves) {
    this.requireTurn(seat);
    const probe = new Chess();
    probe.state(this.chess.state()); // validation stays on: illegal moves throw
    for(const m of moves) {
      try { probe.move(m); }
      catch(err) { throw new GameError(400, `Illegal move: ${m}`); }
    }
    // Moves are validated; turn detection off so submittable() skips the engine's slow mate search
    probe.skipDetection = true;
    const complete = !probe.inCheck && probe.submittable();
    const list = await pool.run('threats', trimState(probe.state()), [], 8000);
    let note;
    if(probe.inCheck) { note = 'After these moves your king is still in check: you could not submit this.'; }
    else if(!complete) { note = 'Turn not complete yet (more present boards need a move); threats assume you stop here.'; }
    else { note = 'These moves complete your turn.'; }
    return {
      moves,
      complete,
      inCheck: probe.inCheck,
      note,
      threats: list,
      threatsText: threatsText(list, probe.inCheck),
    };
  }

  // Stamp boards with the version they (or their current content) first
  // appeared at; returns the structured board data of this position.
  #stampBoards(data) {
    for(const tl of data.timelines) {
      for(const b of tl.boards) {
        const stamp = this.boardStamps.get(b.key);
        if(!stamp || stamp.hash !== b.hash) {
          this.boardStamps.set(b.key, { version: this.version, hash: b.hash });
        }
        b.sinceVersion = this.boardStamps.get(b.key).version;
      }
    }
    return data;
  }

  // One specific board as text, e.g. l='1', t='14b' (fetch-a-board API)
  async singleBoard(seat, l, t) {
    const data = this.#stampBoards(boardsData(this.chess, !this.ended && seat === this.player ? seat : null));
    const tl = data.timelines.find((x) => String(x.L) === String(l));
    const want = String(t).toLowerCase().replace(/^t/, '');
    const b = tl && tl.boards.find((x) => `${x.turn}${x.player[0]}` === want);
    if(!b) { throw new GameError(404, `No board L${l} T${t}. Boards: ` + data.timelines.map((x) => `L${x.L} T...${x.latestLabel}`).join(', ')); }
    return { board: renderBoard(b, data.height), label: b.label };
  }

  // Plain-text-friendly state for LLMs and scripts.
  // With `since` (a version from an earlier response), the timelines text
  // contains the macro-grid plus full grids ONLY for boards that are new or
  // changed since then - plus every playable/latest board as an anchor, so a
  // client never has to rely on remembering a critical board correctly.
  async textState(seat, { since = null } = {}) {
    const state = this.publicState(seat);
    const yourTurn = !this.ended && seat === this.player;
    const threatsList = yourTurn ? await this.currentThreats() : [];
    const legal = yourTurn ? await this.legalMoves() : { moves: [], unverified: 0 };
    return {
      id: this.id,
      version: this.version,
      variant: this.variant,
      you: seat,
      toMove: this.player,
      yourTurn,
      actionNumber: this.chess.actionNumber,
      result: this.result,
      inCheck: this.ended ? false : this.chess.inCheck,
      // Moves you've staged this action (not yet submitted)
      staged: this.stagedMoves(),
      submittable: yourTurn && !this.chess.inCheck && this.chess.submittable(),
      clock: state.clock && {
        white: Math.max(0, Math.round(state.clock.whiteDurationLeft / 1000)),
        black: Math.max(0, Math.round(state.clock.blackDurationLeft / 1000)),
        running: state.clock.running,
      },
      players: state.players,
      pgn: this.chess.export('5dpgn'),
      // Latest board of each timeline, and every board of every timeline as a grid
      boards: boardText(this.chess),
      timelines: this.#timelinesText(seat, yourTurn, since),
      stateVersion: this.version,
      // What the opponent could do if you made no move (your turn only)
      threats: threatsList,
      threatsText: yourTurn ? threatsText(threatsList, this.chess.inCheck) : null,
      legalMoves: legal.moves,
      // > 0 when the legality search timed out: that many listed moves are
      // unproven (kept so a possibly legal move is never hidden)
      legalMovesUnverified: legal.unverified,
    };
  }
  #timelinesText(seat, yourTurn, since) {
    if(since === null) {
      return timelineGrid(this.chess, yourTurn ? seat : null);
    }
    const data = this.#stampBoards(boardsData(this.chess, yourTurn ? seat : null));
    const shown = new Set();
    const micros = [];
    for(const tl of data.timelines) {
      for(const b of tl.boards) {
        if(b.sinceVersion > since || b.playable || b.latest) {
          shown.add(b.key);
          micros.push(renderBoard(b, data.height));
        }
      }
    }
    const total = data.timelines.reduce((n, tl) => n + tl.boards.length, 0);
    const parts = [macroGrid(data, shown)];
    parts.push('', `New/changed and current boards (${micros.length} of ${total}; the rest are unchanged, see get_board):`);
    parts.push('', micros.join('\n\n'));
    return parts.join('\n');
  }
}

const PIECE_LETTER = (p) => (p.piece === '' ? 'P' : p.piece);

// Latest board of every timeline as an 8x8 text grid (white uppercase, black lowercase)
export const boardText = (chess) => {
  const board = chess.board;
  const out = [];
  const timelines = [...board.timelines].sort((a, b) => a.timeline - b.timeline);
  for(const tl of timelines) {
    const turn = tl.turns[tl.turns.length - 1];
    const tags = [];
    if(tl.present) { tags.push('present'); }
    if(!tl.active) { tags.push('inactive'); }
    out.push(`L${tl.timeline} T${turn.turn} ${turn.player} to move${tags.length ? ' [' + tags.join(', ') + ']' : ''}`);
    const grid = [];
    for(let r = 0;r < turn.height;r++) { grid.push(Array(turn.width).fill('.')); }
    for(const p of turn.pieces) {
      const letter = PIECE_LETTER(p);
      grid[turn.height - p.position.rank][p.position.file - 1] = p.player === 'white' ? letter.toUpperCase() : letter.toLowerCase();
    }
    grid.forEach((row, i) => out.push(`${turn.height - i} ${row.join(' ')}`));
    out.push('  ' + 'abcdefgh'.slice(0, turn.width).split('').join(' '));
    out.push('');
  }
  return out.join('\n');
};
