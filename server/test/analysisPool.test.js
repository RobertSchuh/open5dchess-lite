//Worker pool: same results as inline, keeps the event loop free, survives
//runaway jobs, and the async mate-detection path ends games correctly.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { AnalysisPool, pool } from '../src/analysisPool.js';
import { classifyMoves, hasLegalAction, trimState } from '../../shared/legalMoves.js';
import { Game } from '../src/game.js';
import { GAMES, positionsOf, randomGames } from './corpus.mjs';

after(() => pool.destroy());

test('pool results match inline results', async () => {
  const p = new AnalysisPool({ size: 2 });
  try {
    for(const g of Object.values(GAMES)) {
      const positions = positionsOf(g.variant, g.actions);
      const chess = positions[positions.length - 2];
      const state = trimState(chess.state());
      assert.deepEqual(await p.run('classify', state, [60000, 60000], 60000), classifyMoves(chess, 60000, 60000));
      assert.equal(await p.run('hasLegalAction', state, [60000], 60000), hasLegalAction(chess, 60000));
    }
  }
  finally { await p.destroy(); }
});

test('pool keeps the event loop responsive while searching', async () => {
  const p = new AnalysisPool({ size: 1 });
  try {
    const [monster] = randomGames([3], 10);
    const chess = monster[monster.length - 1];
    let maxGap = 0;
    let last = Date.now();
    const tick = setInterval(() => { const now = Date.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 5);
    await p.run('classify', trimState(chess.state()), [60000, 60000], 60000);
    clearInterval(tick);
    assert.ok(maxGap < 150, `event loop blocked for ${maxGap}ms`);
  }
  finally { await p.destroy(); }
});

test('a runaway job is killed, falls back inline, and the pool recovers', async () => {
  const p = new AnalysisPool({ size: 1, graceMs: 200 });
  try {
    //'sleep' burns CPU in the worker for 10 s; budget 100 ms -> killed at ~300 ms.
    //The inline fallback does not understand 'sleep', so the promise rejects
    //into the fallback error... run() resolves via inline which throws -> we
    //expect a rejection here.
    await assert.rejects(p.run('sleep', {}, [10000], 100));
    //Pool spawns a fresh worker and still works
    const positions = positionsOf(GAMES.claudeVsRob.variant, GAMES.claudeVsRob.actions);
    const chess = positions[4];
    const state = trimState(chess.state());
    assert.deepEqual(await p.run('classify', state, [60000, 60000], 60000), classifyMoves(chess, 60000, 60000));
  }
  finally { await p.destroy(); }
});

test('async mate detection ends the game when the quick budget is too small', async () => {
  //endQuickMs: 0 forces every mate check through the pool
  const g = new Game({ id: 'x', endQuickMs: 0 });
  const ended = new Promise((resolve) => g.onChange(() => { if(g.result) { resolve(g.result); } }));
  const actions = GAMES.claudeVsRob.actions;
  actions.forEach((m, i) => {
    const seat = i % 2 === 0 ? 'white' : 'black';
    g.move(seat, m);
    g.submit(seat);
  });
  assert.equal(g.result, null); //not yet: verdict comes from the pool
  const result = await ended;
  assert.deepEqual(result, { winner: 'white', reason: 'checkmate' });
});
