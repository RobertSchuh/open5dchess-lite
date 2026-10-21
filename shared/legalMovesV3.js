//v3 engine: same API and same results as shared/legalMoves.js, but the whole
//search runs inside a Rust->WASM module (shared/v3/engine.wasm, source in
//shared/v3/engine-rs/). Node entry: loads the module synchronously. Browser
//code must use legalMovesV3Core.js with its own async instantiation instead
//(this file reads the wasm from disk).
//
//Limits: 8x8 boards only (all built-in variants). On anything else the
//serializer throws V3Unsupported; callers can fall back to the v2 engine.
import { readFileSync } from 'node:fs';
import { makeEngine, toBuffer, V3Unsupported } from './legalMovesV3Core.js';

export { toBuffer, V3Unsupported };

const wasmBytes = readFileSync(new URL('./v3/engine.wasm', import.meta.url));
const wasmModule = new WebAssembly.Module(wasmBytes);
const instance = new WebAssembly.Instance(wasmModule, {
  env: { now: () => Date.now() },
});

const engine = makeEngine(instance);
export const classifyMoves = engine.classifyMoves;
export const hasLegalAction = engine.hasLegalAction;
export const hasLegalActionDfs = engine.hasLegalActionDfs;
export const hasLegalActionHc = engine.hasLegalActionHc;
export const listMoves = engine.listMoves;
export const completeAction = engine.completeAction;
