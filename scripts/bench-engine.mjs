//Benchmark: reference engine (5d-chess-js plumbing) vs fast engine
//(shared/fastPosition) on real games and generated multi-timeline positions.
//Run: node scripts/bench-engine.mjs
import { createRequire } from 'node:module';
import * as fast from '../shared/legalMoves.js';
import * as reference from '../shared/legalMovesReference.js';
import { threats as threatsFast } from '../server/src/describe.js';
import { threats as threatsBaseline } from './describeBaseline.mjs';
import { GAMES, positionsOf, randomGames } from '../server/test/corpus.mjs';

const require = createRequire(new URL('../server/', import.meta.url));
const Chess = require('5d-chess-js');

const ms = (fn) => { const t = process.hrtime.bigint(); const out = fn(); return [Number(process.hrtime.bigint() - t) / 1e6, out]; };
const fmt = (x) => x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
const speedup = (a, b) => b > 0 ? (a / b).toFixed(1) + 'x' : '-';

const bench = (label, positions, { fullBudget = 120000, prodBudget = [4000, 500], threats = true } = {}) => {
  console.log(`\n## ${label}`);
  console.log('| position | timelines | moves | classify ref | classify fast | speedup | mate ref | mate fast | threats old | threats new |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const totals = { cr: 0, cf: 0, mr: 0, mf: 0, tr: 0, tf: 0, unkRef: 0, unkFast: 0, moves: 0 };
  positions.forEach(({ name, chess }) => {
    const timelines = chess.rawBoard.filter(Boolean).length;
    const nMoves = chess.moves('raw', false, false, false).length;
    const [cr, refClasses] = ms(() => reference.classifyMoves(chess, fullBudget, fullBudget));
    const [cf, fastClasses] = ms(() => fast.classifyMoves(chess, fullBudget, fullBudget));
    const agree = JSON.stringify(refClasses) === JSON.stringify(fastClasses);
    totals.unkRef += refClasses.filter((c) => c === 'unknown').length;
    totals.unkFast += fastClasses.filter((c) => c === 'unknown').length;
    const [mr, ra] = ms(() => reference.hasLegalAction(chess, fullBudget));
    const [mf, fa] = ms(() => fast.hasLegalAction(chess, fullBudget));
    let tr = 0;
    let tf = 0;
    if(threats && !chess.inCheck) {
      [tr] = ms(() => threatsBaseline(chess, fullBudget));
      [tf] = ms(() => threatsFast(chess, fullBudget));
    }
    totals.cr += cr; totals.cf += cf; totals.mr += mr; totals.mf += mf; totals.tr += tr; totals.tf += tf; totals.moves += nMoves;
    console.log(`| ${name}${agree && ra === fa ? '' : ' **MISMATCH**'} | ${timelines} | ${nMoves} | ${fmt(cr)} | ${fmt(cf)} | ${speedup(cr, cf)} | ${fmt(mr)} | ${fmt(mf)} | ${threats && tr ? fmt(tr) : '-'} | ${threats && tf ? fmt(tf) : '-'} |`);
  });
  console.log(`| **total** | | ${totals.moves} | **${fmt(totals.cr)}** | **${fmt(totals.cf)}** | **${speedup(totals.cr, totals.cf)}** | **${fmt(totals.mr)}** | **${fmt(totals.mf)}** | **${fmt(totals.tr)}** | **${fmt(totals.tf)}** |`);
  if(totals.unkRef || totals.unkFast) { console.log(`timeouts: reference ${totals.unkRef}, fast ${totals.unkFast} (of ${totals.moves} move classifications)`); }
  return totals;
};

console.log(`# Engine benchmark (${new Date().toISOString().slice(0, 10)}, Node ${process.version}, ${process.platform})`);
console.log('\nAll times in ms. classify = classifyMoves (legal move hints), mate = hasLegalAction');
console.log('(mate/stalemate detection), threats = full threat analysis. Budgets large enough');
console.log('that nothing times out, so both engines do the same complete work.');

//1. Robert's games: the position after every action
for(const [name, g] of Object.entries(GAMES)) {
  const positions = positionsOf(g.variant, g.actions)
    .map((chess, i) => ({ name: `after action ${i}`, chess }));
  bench(`Game: ${name} (${g.variant})`, positions);
}

//2. Generated multi-timeline positions (random games biased to time travel)
const monsters = [];
for(const [gi, positions] of randomGames([3, 11, 42, 1337], 10).entries()) {
  const last = positions[positions.length - 1];
  monsters.push({ name: `random seed-game ${gi}, final`, chess: last });
}
bench('Generated multi-timeline positions', monsters);

//3. Production budgets on the nastiest corpus: what the app actually does
console.log('\n## Production budgets (classify 4000/500 ms): decisiveness');
console.log('| position | ref unknown | ref ms | fast unknown | fast ms |');
console.log('|---|---|---|---|---|');
for(const [name, g] of Object.entries(GAMES)) {
  const positions = positionsOf(g.variant, g.actions);
  const chess = positions[positions.length - 2]; //position before the final mate
  const [cr, refC] = ms(() => reference.classifyMoves(chess, 4000, 500));
  const [cf, fastC] = ms(() => fast.classifyMoves(chess, 4000, 500));
  console.log(`| ${name}, before final action | ${refC.filter((c) => c === 'unknown').length}/${refC.length} | ${fmt(cr)} | ${fastC.filter((c) => c === 'unknown').length}/${fastC.length} | ${fmt(cf)} |`);
}
