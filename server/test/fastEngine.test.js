//Differential tests: the fast engine (shared/fastPosition + shared/legalMoves)
//must produce the same results as 5d-chess-js and the reference search
//(shared/legalMovesReference) on real games and random time-travel games.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Position } from '../../shared/fastPosition.js';
import * as fast from '../../shared/legalMoves.js';
import * as reference from '../../shared/legalMovesReference.js';

const require = createRequire(import.meta.url);
const Chess = require('5d-chess-js');

import { GAMES, positionsOf, randomGames } from './corpus.mjs';

const rawMoves = (chess) => chess.moves('raw', false, false, false);

const checkPosition = (chess, label, budgets = [8000, 1500]) => {
  const pos = Position.fromChess(chess);
  //1. identical move generation (same list, same order)
  assert.deepEqual(JSON.parse(JSON.stringify(pos.moves())), JSON.parse(JSON.stringify(rawMoves(chess))), `${label}: move lists differ`);
  //2. check detection
  assert.equal(pos.inCheck(), chess.inCheck, `${label}: inCheck differs`);
  //3. submittable
  assert.equal(pos.submittable(), chess.submittable(), `${label}: submittable differs`);
  //4. full classification, reference vs fast
  const ref = reference.classifyMoves(chess, budgets[0], budgets[1]);
  const fst = fast.classifyMoves(chess, budgets[0], budgets[1]);
  assert.equal(fst.length, ref.length, `${label}: classification lengths differ`);
  let unknown = 0;
  for(let i = 0;i < ref.length;i++) {
    if(ref[i] === 'unknown' || fst[i] === 'unknown') { unknown++; continue; }
    assert.equal(fst[i], ref[i], `${label}: move ${i} classified ${fst[i]} (fast) vs ${ref[i]} (reference)`);
  }
  //5. "any legal action" (mate/stalemate detection)
  const refAction = reference.hasLegalAction(chess, 8000);
  const fastAction = fast.hasLegalAction(chess, 8000);
  if(refAction !== 'timeout' && fastAction !== 'timeout') {
    assert.equal(fastAction, refAction, `${label}: hasLegalAction differs`);
  }
  return { moves: ref.length, unknown };
};

for(const [name, g] of Object.entries(GAMES)) {
  test(`fast engine matches reference: ${name} (every position)`, () => {
    const positions = positionsOf(g.variant, g.actions);
    let unknown = 0;
    let moves = 0;
    positions.forEach((chess, i) => {
      const r = checkPosition(chess, `${name} after action ${i}`);
      unknown += r.unknown;
      moves += r.moves;
    });
    //The corpus must be decisive, not full of timeouts
    assert.ok(unknown <= moves * 0.02, `${name}: ${unknown}/${moves} classifications timed out`);
  });
}

test('fast engine matches reference: mid-action staged positions', () => {
  for(const [name, g] of Object.entries(GAMES)) {
    const positions = positionsOf(g.variant, g.actions);
    //Stage the first and last generated move at a few positions
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

test('fast engine matches reference: random time-travel games', () => {
  const games = randomGames([3, 11, 42, 1337], 10);
  let total = 0;
  for(const [gi, positions] of games.entries()) {
    positions.forEach((chess, i) => { checkPosition(chess, `random ${gi} action ${i}`); total++; });
  }
  assert.ok(total >= 12, `only ${total} random positions generated`);
});

test('final positions: mates and the fools-mate non-mate agree', () => {
  //claudeVsRob and mateAcrossTime end in mate; fool's mate does not (5D escape)
  for(const name of ['mateAcrossTime', 'claudeVsRob']) {
    const g = GAMES[name];
    const positions = positionsOf(g.variant, g.actions);
    assert.equal(fast.hasLegalAction(positions[positions.length - 1], 15000), 'no', name);
  }
  const fools = positionsOf('standard', ['f3', 'e5', 'g4', 'Qh4']);
  assert.equal(fast.hasLegalAction(fools[fools.length - 1], 15000), 'yes');
});
