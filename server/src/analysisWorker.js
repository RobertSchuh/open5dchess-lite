// Analysis worker thread: runs the heavy searches (move classification,
// mate/stalemate detection, threat analysis) off the server's event loop.
// Jobs arrive as { id, type, state, args }; `state` is a trimmed
// chess.state() (rawBoard + rawMoveBuffer etc.), enough to rebuild a
// position without any game history.
import { parentPort } from 'node:worker_threads';
import { createRequire } from 'node:module';
import * as v3 from '../../shared/legalMovesV3.js';
import { threats } from './describe.js';

const require = createRequire(import.meta.url);
const Chess = require('5d-chess-js');

// The v3 engine (hypercuboid + DFS, Rust->WASM) is the only engine shipped
// to production; the v2 JS engine stays in the repo as the test oracle and
// loads lazily here only if a position is unsupported (non-8x8 boards, which
// no served variant produces). In a release without shared/legalMoves.js
// that lazy import fails and the original error is reported.
let v2 = null;
const run = async (fn, state, args) => {
  try { return v3[fn](state, ...args); }
  catch(err) {
    try { v2 = v2 || await import('../../shared/legalMoves.js'); }
    catch { throw err; }
    return v2[fn](state, ...args);
  }
};

parentPort.on('message', async ({ id, type, state, args = [] }) => {
  let result;
  let error = null;
  try {
    if(type === 'classify') {
      result = await run('classifyMoves', state, args);
    }
    else if(type === 'hasLegalAction') {
      result = await run('hasLegalAction', state, args);
    }
    else if(type === 'threats') {
      // threats() wants a chess-like instance (it names moves in 5DPGN)
      const chess = new Chess();
      chess.state(state);
      chess.skipDetection = true;
      result = threats(chess, ...args);
    }
    else if(type === 'sleep') {
      // test hook: simulate a runaway job
      const until = Date.now() + args[0];
      while(Date.now() < until) { /* burn */ }
      result = 'slept';
    }
    else {
      throw new Error(`Unknown job type ${type}`);
    }
  }
  catch(err) {
    error = err.message;
  }
  parentPort.postMessage({ id, result, error });
});
