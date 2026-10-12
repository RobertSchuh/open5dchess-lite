#!/usr/bin/env node
// Differential harness: do our engines and the ftxi reference agree on the
// rules? For every position of a set of games, three verdicts on "does the
// player to move have a legal action":
//   v2    shared/legalMoves.js (reference JS engine, differentially tested
//         against 5d-chess-js itself)
//   v3    shared/legalMovesV3.js (Rust/WASM)
//   ftxi  reference/5dchess_engine `5dtools checkmate` (C++ hypercuboid)
// A 'no' verdict splits into checkmate/stalemate via inCheck.
// Disagreements are printed with the exact game PGN and position selector so
// they can be replayed; the summary goes to stdout, details to
// docs/ENGINE-DIFF-REPORT.md.
//
// Usage: node scripts/engine-diff.mjs [--seeds N] [--max-actions M] [--budget MS]
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
//Dependencies live in server/
const require = createRequire(path.join(root, 'server/package.json'));
const Chess = require('5d-chess-js');
const { hasLegalAction } = await import(path.join(root, 'shared/legalMoves.js'));
const v3 = await import(path.join(root, 'shared/legalMovesV3.js'));
const { Position } = await import(path.join(root, 'shared/fastPosition.js'));
const { GAMES } = await import(path.join(root, 'server/test/corpus.mjs'));
const { fixPawnCaptures } = await import(path.join(root, 'shared/notation.js'));

const FTXI = process.env.FTXI || path.join(root, 'reference/5dchess_engine/build/5dtools');

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
};
const SEEDS = arg('seeds', 100);
const MAX_ACTIONS = arg('max-actions', 14);
const BUDGET_MS = arg('budget', 4000);

// --at selector for the position after `actions` submitted actions
const atSelector = (actions) => {
  if(actions === 0) { return '0b'; }
  const black = actions % 2 === 0;
  return `${black ? actions / 2 : (actions + 1) / 2}${black ? 'b' : 'w'}`;
};

// ftxi verdict for one position of a game. 'yes' | 'mate' | 'stalemate' | 'error:...'
const ftxiVerdict = (pgn, actions) => {
  const res = spawnSync(FTXI, ['checkmate', '--at', atSelector(actions)], {
    input: pgn, encoding: 'utf8', timeout: 120000,
  });
  const out = (res.stdout || '').trim();
  if(out.startsWith('Not checkmate')) { return 'yes'; }
  if(out.startsWith('Checkmate')) { return 'mate'; }
  if(out.startsWith('Stalemate')) { return 'stalemate'; }
  return `error: ${out || res.stderr || res.error || 'no output'}`.slice(0, 200);
};

// v2/v3 verdict in the same vocabulary; 'unknown' if the budget ran out
const oursVerdict = (fn, chess) => {
  const pos = Position.fromChess(chess);
  let has;
  try { has = fn(pos, BUDGET_MS); }
  catch(err) { return `error: ${err.message}`.slice(0, 200); }
  if(has === 'yes') { return 'yes'; }
  if(has === 'unknown') { return 'unknown'; }
  return pos.inCheck() ? 'mate' : 'stalemate';
};
const v3HasLegal = (pos, budget) => v3.hasLegalAction(pos, budget);

// Random games with the SERVER's submit rule (never submit while in check),
// biased toward time travel. Deterministic per seed.
const randomGame = (seed0, maxActions) => {
  let seed = seed0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const chess = new Chess();
  chess.skipDetection = true;
  const actions = [];
  const findAction = (c, depth, deadline) => {
    if(c.submittable() && !c.inCheck) { return c; }
    if(Date.now() > deadline || depth > 8) { return null; }
    const moves = c.moves('object', false, false, false);
    const score = (m) => (m.start.timeline !== m.end.timeline || m.start.turn !== m.end.turn ? 1 : 0) + rnd();
    moves.sort((a, b) => score(b) - score(a));
    for(const m of moves.slice(0, 10)) {
      const next = c.copy();
      try { next.move(m); } catch(err) { continue; }
      const done = findAction(next, depth + 1, deadline);
      if(done) { return done; }
    }
    return null;
  };
  for(let a = 0;a < maxActions;a++) {
    const staged = findAction(chess, 0, Date.now() + 2000);
    if(!staged) { break; }
    staged.submit();
    if(staged.rawBoard.filter(Boolean).length > 14) { break; } //keep positions tractable
    //Remember the action in 5DPGN-free form: replay via state
    chess.state(staged.state());
    actions.push(a);
  }
  return chess;
};

// Walk a finished game: verdict at every position (after each action)
const checkGame = (label, variant, buildChess, report) => {
  //Rebuild action by action so each position can be checked
  const full = buildChess();
  //5d-chess-js doubles the file on some pawn captures (eexf6); ftxi rightly
  //rejects that spelling, so normalize before handing the PGN over
  const pgn = fixPawnCaptures(full.export('5dpgn'));
  const total = full.actionHistory.length;
  const chess = new Chess();
  chess.skipDetection = true;
  chess.reset(variant);
  let positions = 0, disagreements = 0, unknowns = 0, ftxiBroken = false;
  for(let k = 0;k <= total;k++) {
    if(k > 0) {
      for(const m of full.actionHistory[k - 1].moves) { chess.move(m); }
      chess.submit();
    }
    const a = oursVerdict(hasLegalAction, chess);
    const b = oursVerdict(v3HasLegal, chess);
    //Once ftxi cannot replay the game (it disputes a move's legality), later
    //positions of the same game are unreachable for it: report it once.
    const f = ftxiBroken ? 'skip' : ftxiVerdict(pgn, k);
    if(f.startsWith('error')) { ftxiBroken = true; }
    positions++;
    const verdicts = { v2: a, v3: b, ftxi: f };
    const firm = Object.values(verdicts).filter((v) => v !== 'unknown' && v !== 'skip' && !v.startsWith('error'));
    if(Object.values(verdicts).some((v) => v === 'unknown')) { unknowns++; }
    const agree = new Set(firm).size <= 1;
    if(!agree || f.startsWith('error')) {
      disagreements++;
      report.push({ label, position: k, at: atSelector(k), verdicts, pgn });
      console.log(`  DISAGREE ${label} @${atSelector(k)}: v2=${a} v3=${b} ftxi=${f}`);
    }
  }
  return { positions, disagreements, unknowns };
};

const report = [];
let totals = { positions: 0, disagreements: 0, unknowns: 0, games: 0 };
const add = (r) => { totals.positions += r.positions; totals.disagreements += r.disagreements; totals.unknowns += r.unknowns; totals.games++; };

console.log(`engine-diff: v2 vs v3 vs ftxi (${SEEDS} random games, max ${MAX_ACTIONS} actions, budget ${BUDGET_MS}ms)`);

//1. Robert's real games (incl. turn_zero variant)
for(const [name, g] of Object.entries(GAMES)) {
  add(checkGame(name, g.variant, () => {
    const c = new Chess();
    c.skipDetection = true;
    c.reset(g.variant);
    for(const a of g.actions) { c.move(a); c.submit(); }
    return c;
  }, report));
  process.stdout.write(`corpus ${name}: ok so far (${totals.positions} positions, ${totals.disagreements} disagreements)\n`);
}

//2. PGN fixtures (final position only is interesting, but all are checked)
const fixtureDir = path.join(root, 'server/test/fixtures');
for(const f of fs.existsSync(fixtureDir) ? fs.readdirSync(fixtureDir).filter((f) => f.endsWith('.5dpgn')) : []) {
  const pgn = fs.readFileSync(path.join(fixtureDir, f), 'utf8');
  try {
    const variant = /\[variant "(.*?)"\]/i.exec(pgn)?.[1];
    add(checkGame(f, 'standard', () => {
      const c = new Chess();
      c.skipDetection = true;
      c.import(pgn);
      return c;
    }, report));
  } catch(err) { console.log(`  fixture ${f} skipped: ${err.message}`); }
  process.stdout.write(`fixture ${f}: done (${totals.positions} positions, ${totals.disagreements} disagreements)\n`);
}

//3. Random time-travel games
for(let seed = 1;seed <= SEEDS;seed++) {
  const full = randomGame(seed, MAX_ACTIONS);
  if(full.actionHistory.length === 0) { continue; }
  add(checkGame(`random-${seed}`, 'standard', () => full, report));
  if(seed % 10 === 0) {
    process.stdout.write(`random ${seed}/${SEEDS}: ${totals.positions} positions, ${totals.disagreements} disagreements, ${totals.unknowns} unknowns\n`);
  }
}

console.log(`\nTOTAL: ${totals.games} games, ${totals.positions} positions, ${totals.disagreements} disagreements, ${totals.unknowns} with an unknown (budget) verdict`);

const md = [`# Engine differential report`, '',
  `${new Date().toISOString()} — v2 vs v3 vs ftxi, ${totals.games} games, ${totals.positions} positions, budget ${BUDGET_MS}ms.`, '',
  `**${totals.disagreements} disagreements**, ${totals.unknowns} positions with an unknown (budget-limited) verdict.`, ''];
for(const d of report) {
  md.push(`## ${d.label} @${d.at}`, '', '```json', JSON.stringify(d.verdicts, null, 2), '```', '', '```', d.pgn.trim(), '```', '');
}
fs.writeFileSync(path.join(root, 'docs/ENGINE-DIFF-REPORT.md'), md.join('\n'));
console.log('report: docs/ENGINE-DIFF-REPORT.md');
process.exit(totals.disagreements > 0 ? 1 : 0);
