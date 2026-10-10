// Thin HTTP client for the open5dchess text endpoints. No game logic here:
// the server validates everything and lists the legal moves.

// Parse an invite link: "http://host:port/#/g/<gameId>?seat=<token>"
export const parseLink = (link) => {
  let url;
  try { url = new URL(String(link).trim()); }
  catch(err) { throw new Error('Not a valid URL. Expected an invite link like http://host/#/g/<id>?seat=<token>'); }
  // The AI text-page link works too: .../api/games/<id>/llm?seat=<token>
  const api = url.pathname.match(/^(.*)\/api\/games\/([\w-]+)\/\w+$/);
  if(api && url.searchParams.get('seat')) {
    return { baseUrl: `${url.protocol}//${url.host}${api[1]}`, gameId: api[2], seat: url.searchParams.get('seat') };
  }
  const m = url.hash.match(/^#\/g\/([\w-]+)\?(.*)$/);
  if(!m) { throw new Error('Not an open5dchess invite link (expected .../#/g/<id>?seat=<token>)'); }
  const seat = new URLSearchParams(m[2]).get('seat');
  if(!seat) { throw new Error('The link has no seat token'); }
  const basePath = url.pathname.replace(/\/[^/]*$/, '');
  return { baseUrl: `${url.protocol}//${url.host}${basePath}`, gameId: m[1], seat };
};

export class GameClient {
  constructor({ baseUrl, gameId, seat }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.gameId = gameId;
    this.seat = seat;
  }
  static fromLink(link) {
    return new GameClient(parseLink(link));
  }

  async request(method, action, { body, query = {}, signal } = {}) {
    const params = new URLSearchParams(Object.assign({ seat: this.seat }, query));
    const url = `${this.baseUrl}/api/games/${encodeURIComponent(this.gameId)}/${action}?${params}`;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });
    }
    catch(err) {
      throw new Error(`Cannot reach the game server at ${this.baseUrl} (${err.cause?.code || err.message})`);
    }
    const data = await res.json().catch(() => ({}));
    if(!res.ok) {
      const err = new Error(data.error || `Server error ${res.status}`);
      err.status = res.status;
      err.legalMoves = data.legalMoves;
      throw err;
    }
    return data;
  }

  state() { return this.request('GET', 'state'); }
  moves(moves, submit = true) { return this.request('POST', 'moves', { body: { moves, submit } }); }
  undo() { return this.request('POST', 'undo'); }
  resign() { return this.request('POST', 'resign'); }
  // What the opponent could do after these moves (nothing is played)
  preview(moves) { return this.request('POST', 'preview', { body: { moves } }); }
  async rules() {
    const res = await fetch(`${this.baseUrl}/api/rules`);
    if(!res.ok) { throw new Error(`Could not load rules (${res.status})`); }
    return res.text();
  }
  // Long-poll until it's our turn or the game ends (server caps at 55 s)
  waitForTurn(timeoutSeconds = 50) {
    const ms = Math.max(1, Math.min(55, timeoutSeconds)) * 1000;
    return this.request('GET', 'wait', { query: { timeout: String(ms) }, signal: AbortSignal.timeout(ms + 10000) });
  }
}

// Create a new game on a server; returns { gameId, seat, links }
export const createGame = async (baseUrl, { variant = 'standard', timeControl = null, creatorColor = 'black', nickname = 'Claude' } = {}) => {
  const base = baseUrl.replace(/\/+$/, '');
  let res;
  try {
    res = await fetch(`${base}/api/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant, timeControl, creatorColor, nickname }),
    });
  }
  catch(err) {
    throw new Error(`Cannot reach the game server at ${base} (${err.cause?.code || err.message})`);
  }
  const data = await res.json().catch(() => ({}));
  if(!res.ok) { throw new Error(data.error || `Server error ${res.status}`); }
  return data;
};

const RESULT_TEXT = { checkmate: 'by checkmate', stalemate: 'by stalemate', time: 'on time', resignation: 'by resignation' };

// Human/LLM readable summary of a state from the server
export const formatState = (s, { includeBoards = true, includeMoves = true, includePgn = false, view = 'all' } = {}) => {
  const lines = [];
  const name = (c) => s.players?.[c]?.nickname || (c === 'white' ? 'White' : 'Black');
  lines.push(`Game ${s.id} · variant ${s.variant} · you are ${s.you}`);
  lines.push(`White: ${name('white')}${s.players?.white?.connected ? '' : ' (not connected)'} · Black: ${name('black')}${s.players?.black?.connected ? '' : ' (not connected)'}`);
  if(s.result) {
    const r = s.result;
    lines.push(r.winner === 'draw' ? `GAME OVER: draw ${RESULT_TEXT[r.reason] || r.reason}` :
      `GAME OVER: ${r.winner} wins ${RESULT_TEXT[r.reason] || r.reason}${r.winner === s.you ? ' (you won)' : (s.you === 'spectator' ? '' : ' (you lost)')}`);
  }
  else {
    lines.push(s.yourTurn ? `YOUR TURN (${s.toMove}), action ${s.actionNumber}${s.inCheck ? ' · YOU ARE IN CHECK' : ''}` : `Waiting: ${s.toMove} to move`);
  }
  if(s.clock) { lines.push(`Clock: white ${fmtTime(s.clock.white)}, black ${fmtTime(s.clock.black)}`); }
  if(s.staged && s.staged.length) {
    lines.push(`Staged this turn (not submitted): ${s.staged.join(' ')}${s.submittable ? ' · can submit now' : ' · more moves needed before submit'}`);
  }
  if(includeBoards) {
    if(view === 'latest' || !s.timelines) {
      lines.push('', 'Latest board of each timeline (White uppercase, Black lowercase):', s.boards.trimEnd());
    }
    else {
      lines.push('', 'All boards (rows = timelines, columns = moments in time; * = you can move there):', s.timelines.trimEnd());
    }
  }
  if(s.yourTurn && s.threatsText) {
    lines.push('', 'THREATS', s.threatsText);
  }
  if(includePgn) {
    lines.push('', 'Game so far (5DPGN):', s.pgn.trim());
  }
  if(includeMoves && s.yourTurn) {
    lines.push('', `Legal moves (${s.legalMoves.length}): ${s.legalMoves.join(', ')}`);
  }
  return lines.join('\n');
};

const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
