//Benchmark: v2 fast engine (shared/legalMoves, JS) vs v3 experimental engine
//(shared/legalMovesV3, Rust->WASM) on the same corpus as bench-engine.mjs.
//Run: node scripts/bench-v3.mjs
import * as v2 from '../shared/legalMoves.js';
import * as v3 from '../shared/legalMovesV3.js';
import { GAMES, positionsOf, randomGames } from '../server/test/corpus.mjs';

const ms = (fn) => { const t = process.hrtime.bigint(); const out = fn(); return [Number(process.hrtime.bigint() - t) / 1e6, out]; };
const fmt = (x) => x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
const speedup = (a, b) => b > 0 ? (a / b).toFixed(1) + 'x' : '-';

const bench = (label, positions, { fullBudget = 120000 } = {}) => {
  console.log(`\n## ${label}`);
  console.log('| position | timelines | moves | classify v2 | classify v3 | speedup | mate v2 | mate v3 | speedup |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  const totals = { c2: 0, c3: 0, m2: 0, m3: 0, moves: 0 };
  positions.forEach(({ name, chess }) => {
    const timelines = chess.rawBoard.filter(Boolean).length;
    const nMoves = chess.moves('raw', false, false, false).length;
    const [c2, a] = ms(() => v2.classifyMoves(chess, fullBudget, fullBudget));
    const [c3, b] = ms(() => v3.classifyMoves(chess, fullBudget, fullBudget));
    const agree = JSON.stringify(a) === JSON.stringify(b);
    const [m2, r2] = ms(() => v2.hasLegalAction(chess, fullBudget));
    const [m3, r3] = ms(() => v3.hasLegalAction(chess, fullBudget));
    totals.c2 += c2; totals.c3 += c3; totals.m2 += m2; totals.m3 += m3; totals.moves += nMoves;
    console.log(`| ${name}${agree && r2 === r3 ? '' : ' **MISMATCH**'} | ${timelines} | ${nMoves} | ${fmt(c2)} | ${fmt(c3)} | ${speedup(c2, c3)} | ${fmt(m2)} | ${fmt(m3)} | ${speedup(m2, m3)} |`);
  });
  console.log(`| **total** | | ${totals.moves} | **${fmt(totals.c2)}** | **${fmt(totals.c3)}** | **${speedup(totals.c2, totals.c3)}** | **${fmt(totals.m2)}** | **${fmt(totals.m3)}** | **${speedup(totals.m2, totals.m3)}** |`);
  return totals;
};

console.log(`# v3 engine benchmark (${new Date().toISOString().slice(0, 10)}, Node ${process.version}, ${process.platform})`);
console.log('\nAll times in ms. classify = classifyMoves (legal move hints), mate = hasLegalAction.');
console.log('Budgets large enough that nothing times out: both engines do the same complete work.');
console.log('v2 = shared/legalMoves.js (fast JS engine); v3 = shared/legalMovesV3.js (Rust->WASM).');

for(const [name, g] of Object.entries(GAMES)) {
  const positions = positionsOf(g.variant, g.actions)
    .map((chess, i) => ({ name: `after action ${i}`, chess }));
  bench(`Game: ${name} (${g.variant})`, positions);
}

const monsters = [];
for(const [gi, positions] of randomGames([3, 11, 42, 1337], 10).entries()) {
  const last = positions[positions.length - 1];
  monsters.push({ name: `random seed-game ${gi}, final`, chess: last });
}
bench('Generated multi-timeline positions', monsters);

console.log('\n## Production budgets (classify 4000/500 ms): decisiveness');
console.log('| position | v2 unknown | v2 ms | v3 unknown | v3 ms |');
console.log('|---|---|---|---|---|');
for(const [name, g] of Object.entries(GAMES)) {
  const positions = positionsOf(g.variant, g.actions);
  const chess = positions[positions.length - 2];
  const [c2, a] = ms(() => v2.classifyMoves(chess, 4000, 500));
  const [c3, b] = ms(() => v3.classifyMoves(chess, 4000, 500));
  console.log(`| ${name}, before final action | ${a.filter((c) => c === 'unknown').length}/${a.length} | ${fmt(c2)} | ${b.filter((c) => c === 'unknown').length}/${b.length} | ${fmt(c3)} |`);
}
