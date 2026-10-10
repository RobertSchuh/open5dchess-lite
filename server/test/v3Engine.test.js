//Differential tests: the v3 WASM engine (shared/legalMovesV3, Rust) must
//produce the same results as the v2 fast engine (shared/legalMoves), which is
//itself differential-tested against 5d-chess-js in fastEngine.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position } from '../../shared/fastPosition.js';
import * as v2 from '../../shared/legalMoves.js';
import * as v3 from '../../shared/legalMovesV3.js';

import { GAMES, positionsOf, randomGames } from './corpus.mjs';

const checkPosition = (chess, label, budgets = [8000, 1500]) => {
  const pos = Position.fromChess(chess);
  //1. identical move generation (same list, same order)
  assert.deepEqual(
    v3.listMoves(chess),
    JSON.parse(JSON.stringify(pos.moves())),
    `${label}: move lists differ`
  );
  //2. full classification
  const a = v2.classifyMoves(chess, budgets[0], budgets[1]);
  const b = v3.classifyMoves(chess, budgets[0], budgets[1]);
  assert.equal(b.length, a.length, `${label}: classification lengths differ`);
  let unknown = 0;
  for(let i = 0;i < a.length;i++) {
    if(a[i] === 'unknown' || b[i] === 'unknown') { unknown++; continue; }
    assert.equal(b[i], a[i], `${label}: move ${i} classified ${b[i]} (v3) vs ${a[i]} (v2)`);
  }
  //3. mate/stalemate detection
  const av = v2.hasLegalAction(chess, 8000);
  const bv = v3.hasLegalAction(chess, 8000);
  if(av !== 'timeout' && bv !== 'timeout') {
    assert.equal(bv, av, `${label}: hasLegalAction differs`);
  }
  return { moves: a.length, unknown };
};

for(const [name, g] of Object.entries(GAMES)) {
  test(`v3 engine matches v2: ${name} (every position)`, () => {
    const positions = positionsOf(g.variant, g.actions);
    let unknown = 0;
    let moves = 0;
    positions.forEach((chess, i) => {
      const r = checkPosition(chess, `${name} after action ${i}`);
      unknown += r.unknown;
      moves += r.moves;
    });
    assert.ok(unknown <= moves * 0.02, `${name}: ${unknown}/${moves} classifications timed out`);
  });
}

test('v3 engine matches v2: mid-action staged positions', () => {
  for(const [name, g] of Object.entries(GAMES)) {
    const positions = positionsOf(g.variant, g.actions);
    for(const i of [2, positions.length - 2]) {
      const base = positions[i];
      const objects = base.moves('object', false, false, false);
      for(const pick of [0, objects.length - 1]) {
        if(!objects[pick]) { continue; }
        const staged = base.copy();
        staged.move(objects[pick]);
        checkPosition(staged, `${name} pos ${i} staged move ${pick}`);
      }
    }
  }
});

test('v3 engine matches v2: random time-travel games', () => {
  const games = randomGames([3, 11, 42, 1337], 10);
  let total = 0;
  for(const [gi, positions] of games.entries()) {
    positions.forEach((chess, i) => { checkPosition(chess, `random ${gi} action ${i}`); total++; });
  }
  assert.ok(total >= 12, `only ${total} random positions generated`);
});

test('v3 final positions: mates and the fools-mate non-mate agree', () => {
  for(const name of ['mateAcrossTime', 'claudeVsRob']) {
    const g = GAMES[name];
    const positions = positionsOf(g.variant, g.actions);
    assert.equal(v3.hasLegalAction(positions[positions.length - 1], 15000), 'no', name);
  }
  const fools = positionsOf('standard', ['f3', 'e5', 'g4', 'Qh4']);
  assert.equal(v3.hasLegalAction(fools[fools.length - 1], 15000), 'yes');
});
