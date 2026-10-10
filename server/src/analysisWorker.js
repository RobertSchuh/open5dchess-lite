// Analysis worker thread: runs the heavy searches (move classification,
// mate/stalemate detection, threat analysis) off the server's event loop.
// Jobs arrive as { id, type, state, args }; `state` is a trimmed
// chess.state() (rawBoard + rawMoveBuffer etc.), enough to rebuild a
// position without any game history.
import { parentPort } from 'node:worker_threads';
import { createRequire } from 'node:module';
import * as v2 from '../../shared/legalMoves.js';
import { threats } from './describe.js';

const require = createRequire(import.meta.url);
const Chess = require('5d-chess-js');

// ENGINE_V3=1 switches the searches to the experimental Rust->WASM engine
// (shared/legalMovesV3.js); any per-call failure falls back to the v2 engine.
let v3 = null;
if(process.env.ENGINE_V3 === '1') {
  try { v3 = await import('../../shared/legalMovesV3.js'); }
  catch(err) { console.error(`v3 engine unavailable, using v2: ${err.message}`); }
}
const run = (fn, state, args) => {
  if(v3) {
    try { return v3[fn](state, ...args); }
    catch { /* unsupported position (non-8x8 board): fall through to v2 */ }
  }
  return v2[fn](state, ...args);
};

parentPort.on('message', ({ id, type, state, args = [] }) => {
  let result;
  let error = null;
  try {
    if(type === 'classify') {
      result = run('classifyMoves', state, args);
    }
    else if(type === 'hasLegalAction') {
      result = run('hasLegalAction', state, args);
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
