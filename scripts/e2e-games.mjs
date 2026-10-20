#!/usr/bin/env node
// Pre-deploy E2E gate: replay recorded games through ONLINE play (API +
// browser UI) and LOCAL play (browser UI driving the session manager), and
// assert the ends are detected correctly - including that non-mates do NOT
// end. Run `bash scripts/predeploy.sh` before any rsync to the Pi.
//
// Cases: the three corpus mates (turn-zero time-travel mate, cross-timeline
// mate, queen-back-in-time mate) + fool's mate as the must-not-end negative.
// The zy monster stays out: its mate proof is engine-harness territory
// (scripts/engine-diff.mjs) and local play's budget is deliberately small.
//
// Usage: node scripts/e2e-games.mjs   (starts its own server on E2E_PORT)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { GAMES } = await import(path.join(root, 'server/test/corpus.mjs'));
const require = createRequire(path.join(root, 'client/package.json'));

const PORT = Number(process.env.E2E_PORT || 8123);
const BASE = `http://127.0.0.1:${PORT}`;
//Test what ships: the release client if it has been built, else client/dist
const releaseDist = path.join(root, 'release/client/dist');
const STATIC = fs.existsSync(path.join(releaseDist, 'index.html')) ? releaseDist : path.join(root, 'client/dist');

const CASES = [
  ...Object.entries(GAMES).map(([name, g]) => ({
    name, variant: g.variant, actions: g.actions,
    //all corpus games end with the last mover delivering mate
    expect: { reason: 'checkmate', winner: g.actions.length % 2 === 1 ? 'white' : 'black' },
  })),
  //fool's mate is NOT mate in 5D: the king escapes through time
  { name: 'fools-mate-not-mate', variant: 'standard', actions: ['f3', 'e5', 'g4', 'Qh4'], expect: 'ongoing' },
];

const chromePath = () => {
  const dirs = fs.readdirSync(path.join(os.homedir(), '.cache/ms-playwright')).filter((d) => /^chromium-\d+$/.test(d)).sort();
  if(!dirs.length) { throw new Error('no playwright chromium in ~/.cache/ms-playwright (npx playwright-core install chromium)'); }
  return path.join(os.homedir(), '.cache/ms-playwright', dirs[dirs.length - 1], 'chrome-linux64/chrome');
};

const api = async (method, p, body) => {
  const res = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return res.json();
};
const seatOf = (link) => link.split('seat=')[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
  if(!cond) { failures++; }
};

//=== online: API replay + UI banner ==========================================
const onlineCase = async (browser, c) => {
  const g = await api('POST', '/api/games', { variant: c.variant });
  const seats = [seatOf(g.links.white), seatOf(g.links.black)];
  for(let i = 0;i < c.actions.length;i++) {
    const r = await api('POST', `/api/games/${g.gameId}/moves?seat=${seats[i % 2]}`, { moves: [c.actions[i]] });
    if(r.error) { check(`online ${c.name}: move ${i} (${c.actions[i]})`, false, r.error); return; }
  }
  //end detection may finish async in the worker pool
  let state = null;
  for(let t = 0;t < 60;t++) {
    state = await api('GET', `/api/games/${g.gameId}/state?seat=${seats[0]}`);
    if(state.result) { break; }
    if(c.expect === 'ongoing' && t >= 5) { break; }
    await sleep(1000);
  }
  if(c.expect === 'ongoing') {
    check(`online ${c.name}: still running`, state.result === null, JSON.stringify(state.result));
    const next = seats[c.actions.length % 2];
    const s2 = await api('GET', `/api/games/${g.gameId}/state?seat=${next}`);
    check(`online ${c.name}: mover has legal moves`, (s2.legalMoves || []).length > 0);
    return;
  }
  check(`online ${c.name}: result`, state.result && state.result.reason === c.expect.reason && state.result.winner === c.expect.winner,
    JSON.stringify(state.result));
  //the UI must show it too
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/#/g/${g.gameId}?seat=${seats[0]}`);
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForTimeout(2000);
  const body = await page.textContent('body');
  check(`online ${c.name}: UI banner`, body.includes('wins by checkmate'), body.slice(0, 120));
  check(`online ${c.name}: no page errors`, errs.length === 0, errs.join(' | ').slice(0, 150));
  await page.close();
};

//=== local: UI replay through the session manager ============================
const localCase = async (browser, c) => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE + '/');
  await page.evaluate((variant) => {
    localStorage.setItem('settings', JSON.stringify({ locale: 'en', eruda: false, quickPlay: { variants: [variant], formats: ['none'] } }));
  }, c.variant);
  await page.reload();
  await page.waitForTimeout(1200);
  await page.click('button:has-text("Local Play")');
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForFunction(() => window.open5dSession && window.open5dSession.chess, { timeout: 15000 });
  await page.waitForTimeout(1000);
  const replay = await page.evaluate(async (actions) => {
    const sm = window.open5dSession;
    //pause the sync loop: it would undo staged moves mid-replay
    sm.allowUpdate = false;
    clearTimeout(sm.updateIntervalHandler);
    try {
      for(const mv of actions) {
        sm.chess.move(mv);
        await sm.submit();
      }
      return { ok: true };
    }
    catch(err) { return { ok: false, error: String(err && err.message || err) }; }
    finally {
      sm.allowUpdate = true;
      sm.updateInterval();
    }
  }, c.actions);
  if(!replay.ok) { check(`local ${c.name}: replay`, false, replay.error); await page.close(); return; }
  if(c.expect === 'ongoing') {
    await page.waitForTimeout(6000);
    const sess = await page.evaluate(() => ({ ended: window.open5dSession.session.ended, winner: window.open5dSession.session.winner }));
    check(`local ${c.name}: still running`, !sess.ended && !sess.winner, JSON.stringify(sess));
  }
  else {
    let sess = null;
    for(let t = 0;t < 20;t++) {
      sess = await page.evaluate(() => ({ ended: window.open5dSession.session.ended, winner: window.open5dSession.session.winner, cause: window.open5dSession.session.winCause }));
      if(sess.ended) { break; }
      await sleep(1000);
    }
    check(`local ${c.name}: mate detected`, sess.ended && sess.winner === c.expect.winner && sess.cause === 'regular', JSON.stringify(sess));
    //the banner renders a beat after the session ends
    const banner = await page.waitForFunction(() => document.body.textContent.includes('Wins!'), { timeout: 8000 }).then(() => true).catch(() => false);
    check(`local ${c.name}: UI banner`, banner);
  }
  check(`local ${c.name}: no page errors`, errs.length === 0, errs.join(' | ').slice(0, 150));
  await page.close();
};

//=== hints worker: the wasm classifier must produce piece highlights =========
const hintsCase = async (browser) => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const consoleErrs = [];
  page.on('console', (m) => { if(m.type() === 'error') consoleErrs.push(m.text()); });
  await page.goto(BASE + '/');
  await page.waitForTimeout(1200);
  await page.click('button:has-text("Local Play")');
  await page.waitForSelector('canvas', { timeout: 20000 });
  await page.waitForFunction(() => window.open5dSession && window.open5dSession.chess, { timeout: 15000 });
  //turn hints on for white through the manager's own config path
  const hints = await page.evaluate(async () => {
    const sm = window.open5dSession;
    const got = () => sm.legalHints.get(sm.chess);
    //flip the config the same way the in-game toggle does
    const cfg = JSON.parse(localStorage.getItem('config') || '{}');
    cfg.extra = Object.assign({}, cfg.extra, { legalMoveHints: { white: true, black: true } });
    localStorage.setItem('config', JSON.stringify(cfg));
    //poll until the worker answers with legal pieces
    for(let t = 0;t < 30;t++) {
      const r = got();
      if(r.legalPieces && r.legalPieces.length > 0) { return { pieces: r.legalPieces.length, moves: r.availableMoves.length }; }
      await new Promise((res) => setTimeout(res, 500));
    }
    return null;
  });
  check('hints: wasm worker classifies opening', hints && hints.pieces > 0 && hints.moves === 20, JSON.stringify(hints));
  check('hints: no v3 fallback errors', !consoleErrs.some((t) => t.includes('v3 engine unavailable')), consoleErrs.join(' | ').slice(0, 150));
  await page.close();
};

//=== run ======================================================================
console.log(`e2e-games: serving ${path.relative(root, STATIC)} on :${PORT}`);
const server = spawn('node', ['src/index.js'], {
  cwd: path.join(root, 'server'),
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', STATIC_DIR: STATIC, END_SEARCH_MS: '30000' },
  stdio: 'ignore',
});
try {
  for(let t = 0;t < 20;t++) {
    try { const h = await api('GET', '/api/health'); if(h.ok) break; } catch {}
    await sleep(500);
  }
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
  const guard = async (label, fn) => {
    try { await fn(); }
    catch(err) { check(label, false, String(err && err.message || err).slice(0, 150)); }
  };
  for(const c of CASES) { await guard(`online ${c.name}`, () => onlineCase(browser, c)); }
  for(const c of CASES) { await guard(`local ${c.name}`, () => localCase(browser, c)); }
  await guard('hints', () => hintsCase(browser));
  await browser.close();
}
finally {
  server.kill();
}
console.log(failures === 0 ? '\nE2E PASS' : `\nE2E FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
