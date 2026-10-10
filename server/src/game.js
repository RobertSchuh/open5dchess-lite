// One game: two seats (white/black) plus spectators, the rules engine,
// an optional clock, and change notifications. Everything lives in memory.
import { createRequire } from 'node:module';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { classifyMoves, hasLegalAction, trimState } from '../../shared/legalMoves.js';

const require = createRequire(import.meta.url);
const Chess = require('5d-chess-js');
const ChessClock = require('5d-chess-clock');

export const VARIANTS = ['standard', 'defended_pawn', 'half_reflected', 'princess', 'turn_zero', 'two_timelines', 'reversed_royalty'];

// Search budgets (ms). The engine's own mate search reports "mate" when it
// times out, so the server uses shared/legalMoves.js instead.
const END_SEARCH_MS = 10000;
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
  constructor({ id, variant = 'standard', timeControl = null, now = Date.now }) {
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
      white: { token: newToken(), nickname: null, connections: 0 },
      black: { token: newToken(), nickname: null, connections: 0 },
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
  }

  // Which seat does this token belong to? 'white' | 'black' | 'spectator' | null
  seatFor(token) {
    let res = null;
    // Compare against every token (no early exit) so timing reveals nothing
    if(tokenEquals(token, this.seats.white.token)) { res = 'white'; }
    if(tokenEquals(token, this.seats.black.token)) { res = 'black'; }
    if(tokenEquals(token, this.spectateToken)) { res = res || 'spectator'; }
    return res;
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
  detectEnd() {
    const probe = new Chess();
    probe.state(trimState(this.chess.state()));
    probe.skipDetection = true;
    const res = hasLegalAction(probe, END_SEARCH_MS);
    if(res === 'no') {
      if(probe.inCheck) {
        this.end(other(this.player), 'checkmate');
      }
      else {
        this.end('draw', 'stalemate');
      }
    }
  }

  resign(seat) {
    if(this.ended) { throw new GameError(409, 'Game is over'); }
    if(seat !== 'white' && seat !== 'black') { throw new GameError(403, 'Spectators cannot resign'); }
    this.end(other(seat), 'resignation');
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
        white: { nickname: this.seats.white.nickname, connected: this.seats.white.connections > 0 },
        black: { nickname: this.seats.black.nickname, connected: this.seats.black.connections > 0 },
      },
    };
  }

  // Moves for the player to move that can still lead to a submittable action
  legalMoves() {
    if(this.ended) { return []; }
    if(this.legalCache && this.legalCache.version === this.version) { return this.legalCache.moves; }
    const probe = new Chess();
    probe.state(trimState(this.chess.state()));
    probe.skipDetection = true;
    const names = probe.moves('5dpgn', false, false, false).trim().split('\n').filter(Boolean);
    const classes = classifyMoves(probe, LEGAL_MOVES_MS);
    // 'unknown' (search timed out) is kept: never hide a possibly legal move
    const moves = names.filter((n, i) => classes[i] !== 'illegal');
    this.legalCache = { version: this.version, moves };
    return moves;
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

  // Plain-text-friendly state for LLMs and scripts
  textState(seat) {
    const state = this.publicState(seat);
    const yourTurn = !this.ended && seat === this.player;
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
      boards: boardText(this.chess),
      legalMoves: yourTurn ? this.legalMoves() : [],
    };
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
