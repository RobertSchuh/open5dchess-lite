import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { createApp } from '../src/app.js';
import { RULES, timelineGrid } from '../src/describe.js';

// Claude (Black) vs Robert, 2026-10-10: Black lost to a time-travel queen mate
const LOSS = ['e3', 'e5', 'Qf3', 'Nf6', 'Nc3', 'Nc6', 'Nd5', 'Nxd5', 'e4', 'Ndb4', 'c3', 'Nc2', 'Kd1', 'Nxa1', 'a3'];
const replay = (moves) => {
  const g = new Game({ id: 'x' });
  moves.forEach((m, i) => { const seat = i % 2 === 0 ? 'white' : 'black'; g.move(seat, m); g.submit(seat); });
  return g;
};

test('threats flag the time-travel mate Black walked into', () => {
  const g = replay(LOSS);
  const s = g.textState('black');
  const mate = s.threats.find((t) => t.kind === 'mate');
  assert.ok(mate, s.threatsText);
  assert.equal(mate.move, '(0T9)Qf3>>x(0T5)f7~');
  assert.equal(mate.travel, true);
  assert.match(s.threatsText, /MATE THREAT/);
  // Not shown to the side that isn't on move
  assert.deepEqual(g.textState('white').threats, []);
});

test('preview shows what a candidate move allows, without playing it', () => {
  // Before 4...Nxd5: taking reopens the f-file (Robert's point)
  const g = replay(LOSS.slice(0, 7));
  const v = g.version;
  const p = g.preview('black', ['Nxd5']);
  assert.equal(p.complete, true);
  assert.ok(p.threats.some((t) => t.move === 'Qxd5' && t.captured === 'knight'));
  assert.equal(g.version, v);           // nothing changed
  assert.deepEqual(g.chess.moveBuffer, []);
  assert.throws(() => g.preview('black', ['Ke2']), /Illegal move/);
  assert.throws(() => g.preview('white', ['e4']), /Not your turn/);
});

test('timeline grid shows every board, aligned in time, with playable marks', () => {
  const g = replay(['e4', 'e5']);
  const grid = timelineGrid(g.chess, 'white');
  assert.match(grid, /Timeline L0 \(active, in the present; latest board T2w, white to move\)/);
  assert.match(grid, /T1w {7}T1b {7}T2w\*/);
  assert.match(grid, /^4 {2}\.{8} {2}\.{4}P\.{3} {2}\.{4}P\.{3}$/m);
});

let app;
let base;
before(async () => {
  app = createApp({});
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(() => { app.server.closeAllConnections(); app.server.close(); });

test('rules endpoint and LLM page are plain text with rules, state and API', async () => {
  const rules = await fetch(`${base}/api/rules`);
  assert.match(rules.headers.get('content-type'), /text\/plain/);
  assert.equal((await rules.text()).trim(), RULES);

  const created = await (await fetch(`${base}/api/games`, { method: 'POST' })).json();
  const seat = new URL(created.links.white.replace('/#/', '/')).searchParams.get('seat');
  const page = await (await fetch(`${base}/api/games/${created.gameId}/llm?seat=${seat}`)).text();
  assert.match(page, /RULES PRIMER/);
  assert.match(page, /IT IS YOUR TURN \(white\)/);
  assert.match(page, /LEGAL MOVES \(20\)/);
  assert.match(page, /THREATS/);
  assert.ok(page.includes(`${base}/api/games/${created.gameId}/moves?seat=${seat}`));

  const prev = await fetch(`${base}/api/games/${created.gameId}/preview?seat=${seat}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moves: ['f3'] }),
  });
  assert.equal(prev.status, 200);
  assert.equal((await prev.json()).complete, true);
});
