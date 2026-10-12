import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createApp } from '../src/app.js';
import { RateLimiter } from '../src/ratelimit.js';

let app;
let base;

before(async () => {
  app = createApp({ createLimit: new RateLimiter({ rate: 1, perMs: 60000, burst: 30 }) });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(() => {
  for(const ws of app.wss.clients) { ws.terminate(); }
  app.server.closeAllConnections();
  app.server.close();
});

const call = async (method, path, body) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  return { status: res.status, body: await res.json() };
};
const seatOf = (link) => new URL(link.replace('/#/', '/')).searchParams.get('seat');
const newGame = async (opts = {}) => {
  const { status, body } = await call('POST', '/api/games', opts);
  assert.equal(status, 201);
  return { id: body.gameId, body, W: seatOf(body.links.white), B: seatOf(body.links.black), S: seatOf(body.links.spectate) };
};

test('create returns invite links for both seats and spectators', async () => {
  const { body } = await newGame({ creatorColor: 'black', nickname: 'Robert' });
  assert.equal(body.seat, 'black');
  assert.match(body.links.white, /^http:\/\/127\.0\.0\.1:\d+\/#\/g\/[\w-]+\?seat=[\w-]{22}$/);
  const state = await call('GET', `/api/games/${body.gameId}/state?seat=${seatOf(body.links.spectate)}`);
  assert.equal(state.body.players.black.nickname, 'Robert');
  assert.equal(state.body.you, 'spectator');
});

test('bad seat token is 403, unknown game 404', async () => {
  const { id } = await newGame();
  assert.equal((await call('GET', `/api/games/${id}/state?seat=wrong`)).status, 403);
  assert.equal((await call('GET', `/api/games/${id}/state`)).status, 403);
  assert.equal((await call('GET', `/api/games/nope/state?seat=x`)).status, 404);
});

test('moves in one request are all-or-nothing, with legal moves on error', async () => {
  const { id, W } = await newGame();
  const bad = await call('POST', `/api/games/${id}/moves?seat=${W}`, { moves: ['e4', 'Ke2'] });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /Illegal move: Ke2/);
  assert.equal(bad.body.legalMoves.length, 20);
  const state = await call('GET', `/api/games/${id}/state?seat=${W}`);
  assert.deepEqual(state.body.staged, []); // e4 was rolled back
  const ok = await call('POST', `/api/games/${id}/moves?seat=${W}`, { moves: ['e4'] });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.toMove, 'black');
});

test('rematch restarts the game on the same links with colors swapped', async () => {
  const { id, W, B, S } = await newGame();
  // not over yet
  assert.equal((await call('POST', `/api/games/${id}/rematch?seat=${W}`)).status, 409);
  await call('POST', `/api/games/${id}/moves?seat=${W}`, { moves: ['e4'] });
  await call('POST', `/api/games/${id}/resign?seat=${B}`);
  assert.equal((await call('POST', `/api/games/${id}/rematch?seat=${S}`)).status, 403);
  const re = await call('POST', `/api/games/${id}/rematch?seat=${B}`);
  assert.equal(re.status, 200);
  // The response already speaks from the new perspective
  assert.equal(re.body.you, 'white');
  assert.equal(re.body.result, null);
  assert.equal(re.body.pgn.includes('e4'), false);
  const other = await call('GET', `/api/games/${id}/state?seat=${W}`);
  assert.equal(other.body.you, 'black');
});

test('GET fallback plays moves for fetch-only agents', async () => {
  const { id, W, B } = await newGame();
  // no moves param -> explanatory 400, nothing happens
  const empty = await call('GET', `/api/games/${id}/moves?seat=${W}`);
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /moves=/);
  // play and submit via GET
  const ok = await call('GET', `/api/games/${id}/moves?seat=${W}&moves=e4`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.toMove, 'black');
  // stage without submitting
  const staged = await call('GET', `/api/games/${id}/moves?seat=${B}&moves=e5&submit=false`);
  assert.equal(staged.status, 200);
  assert.deepEqual(staged.body.staged.length, 1);
  assert.equal(staged.body.toMove, 'black'); // not submitted yet
  // illegal move via GET: rolled back, legal moves included
  const bad = await call('GET', `/api/games/${id}/moves?seat=${B}&moves=Ke4`);
  assert.equal(bad.status, 400);
  assert.ok(Array.isArray(bad.body.legalMoves));
  // soft=1: same error but status 200, for tools that hide 4xx bodies
  const soft = await call('GET', `/api/games/${id}/moves?seat=${B}&moves=Ke4&soft=1`);
  assert.equal(soft.status, 200);
  assert.equal(soft.body.ok, false);
  assert.match(soft.body.error, /Illegal move/);
  assert.ok(Array.isArray(soft.body.legalMoves));
});

test('spectators cannot move', async () => {
  const { id, S } = await newGame();
  const res = await call('POST', `/api/games/${id}/moves?seat=${S}`, { moves: ['e4'] });
  assert.equal(res.status, 403);
});

test('invalid JSON and oversized bodies are rejected', async () => {
  const { id, W } = await newGame();
  assert.equal((await call('POST', `/api/games/${id}/moves?seat=${W}`, '{nope')).status, 400);
  const big = await call('POST', `/api/games/${id}/moves?seat=${W}`, { moves: ['e4'], pad: 'x'.repeat(20000) });
  assert.equal(big.status, 413);
});

test('wait returns when the opponent has moved', async () => {
  const { id, W, B } = await newGame();
  const t0 = Date.now();
  const waiting = call('GET', `/api/games/${id}/wait?seat=${B}&timeout=5000`);
  await new Promise((r) => setTimeout(r, 200));
  await call('POST', `/api/games/${id}/moves?seat=${W}`, { moves: ['d4'] });
  const res = await waiting;
  assert.equal(res.status, 200);
  assert.equal(res.body.yourTurn, true);
  assert.ok(Date.now() - t0 < 4000);
  assert.ok(res.body.legalMoves.includes('d5'));
});

test('wait times out with the current state', async () => {
  const { id, B } = await newGame();
  const res = await call('GET', `/api/games/${id}/wait?seat=${B}&timeout=300`);
  assert.equal(res.body.timeout, true);
  assert.equal(res.body.yourTurn, false);
});

test('game creation is rate limited per IP', async () => {
  const strict = createApp({ createLimit: new RateLimiter({ rate: 1, perMs: 60000, burst: 2 }) });
  await new Promise((r) => strict.server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${strict.server.address().port}/api/games`;
  const statuses = [];
  for(let i = 0;i < 3;i++) { statuses.push((await fetch(url, { method: 'POST' })).status); }
  strict.server.closeAllConnections();
  strict.server.close();
  assert.deepEqual(statuses, [201, 201, 429]);
});

test('websocket rejects bad tokens', async () => {
  const { id } = await newGame();
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?game=${id}&seat=bad`);
  const err = await new Promise((resolve) => ws.on('unexpected-response', (req, res) => resolve(res.statusCode)));
  assert.equal(err, 403);
});

// --- End to end: two WebSocket clients replay a real game with time travel ---

const connect = (id, seat) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?game=${id}&seat=${seat}`);
  const client = { ws, states: [], errors: [], waiters: [] };
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if(msg.type === 'state') { client.states.push(msg.state); }
    if(msg.type === 'error') { client.errors.push(msg.message); }
    for(const w of [...client.waiters]) { w(); }
  });
  ws.on('open', () => resolve(client));
  ws.on('error', reject);
});
const until = (client, pred) => new Promise((resolve, reject) => {
  const check = () => {
    const last = client.states[client.states.length - 1];
    if(last && pred(last)) {
      client.waiters = client.waiters.filter((w) => w !== check);
      resolve(last);
    }
  };
  client.waiters.push(check);
  check();
  setTimeout(() => reject(new Error('timeout waiting for state')), 15000).unref();
});

test('e2e: two sockets play a time-travel game to checkmate', async () => {
  // Robert's test game, Turn Zero variant; both sides travel back in time on move 7
  const actions = [
    ['white', ['e3']], ['black', ['e6']],
    ['white', ['Qf3']], ['black', ['Nc6']],
    ['white', ['Na3']], ['black', ['Nb4']],
    ['white', ['Nb5']], ['black', ['Nxa2']],
    ['white', ['Rxa2']], ['black', ['a6']],
    ['white', ['Nxc7']], ['black', ['Qxc7']],
    ['white', ['(0T7)Qf3>>x(0T3)f7~']], ['black', ['(0T7)Qc7>>x(0T2)c2~']],
    ['white', ['(-1T3)Qxf7']],
  ];
  const { id, W, B, S } = await newGame({ variant: 'turn_zero' });
  const white = await connect(id, W);
  const black = await connect(id, B);
  const spectator = await connect(id, S);
  const clients = { white, black };

  // A move by the wrong side is rejected over the socket
  black.ws.send(JSON.stringify({ type: 'move', move: 'e6' }));
  await new Promise((r) => setTimeout(r, 100));
  assert.match(black.errors[0], /Not your turn/);

  for(const [i, [color, moves]] of actions.entries()) {
    const c = clients[color];
    for(const m of moves) { c.ws.send(JSON.stringify({ type: 'move', move: m })); }
    c.ws.send(JSON.stringify({ type: 'submit' }));
    await until(spectator, (s) => s.actionHistory.length === i + 1 || s.result !== null);
  }
  const final = await until(white, (s) => s.result !== null);
  assert.deepEqual(final.result, { winner: 'white', reason: 'checkmate' });
  assert.equal(final.actionHistory.length, actions.length);
  // Time travel created two extra timelines
  const timelines = new Set(final.actionHistory.flatMap((a) => a.moves.map((m) => m.end.timeline)));
  assert.ok(timelines.has(0));
  const state = await call('GET', `/api/games/${id}/state?seat=${S}`);
  assert.match(state.body.boards, /L-1 /);
  assert.match(state.body.boards, /L1 /);
  for(const c of [white, black, spectator]) { c.ws.close(); }
});
