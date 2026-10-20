//Web worker: runs the legal move search off the main thread. Receives
//{ key, state: { rawBoard, rawAction, rawPromotionPieces } } and answers
//{ key, classes }.
//
//The search runs on the v3 Rust->WASM engine (same classifier the server
//uses); the wasm instantiates asynchronously at worker start, and until it
//is ready - or if a position is unsupported - the v2 JS engine answers.
import { classifyMoves as classifyV2 } from 'shared/legalMoves.js';
import { makeEngine } from 'shared/legalMovesV3Core.js';
import wasmUrl from 'shared/v3/engine.wasm?url';

let v3 = null;
const v3Ready = fetch(wasmUrl)
  .then(async (resp) => {
    const imports = { env: { now: () => Date.now() } };
    //instantiateStreaming needs the application/wasm MIME type; fall back to
    //ArrayBuffer instantiation for hosts that serve wasm as octet-stream
    try { return await WebAssembly.instantiateStreaming(resp.clone(), imports); }
    catch { return WebAssembly.instantiate(await resp.arrayBuffer(), imports); }
  })
  .then((res) => { v3 = makeEngine(res.instance); })
  .catch((err) => { console.error('v3 engine unavailable in hints worker, using v2:', err); });

self.onmessage = async (e) => {
  const { key, state } = e.data;
  let classes = null;
  try {
    if(v3 === null) { await v3Ready; }
    classes = v3 ? v3.classifyMoves(state) : classifyV2(state);
  }
  catch(err) {
    //unsupported position (non-8x8) or wasm trap: the v2 engine still works
    try { classes = classifyV2(state); }
    catch(err2) { console.error(err2); }
  }
  self.postMessage({ key, classes });
};
