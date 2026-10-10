//v3 experimental engine: same API and same results as shared/legalMoves.js,
//but the whole search runs inside a Rust->WASM module (shared/v3/engine.wasm,
//source in shared/v3/engine-rs/). The position is serialized once per call;
//everything else (movegen, apply/undo, check scan, hashing, DFS) is native.
//
//Limits: 8x8 boards only (all built-in variants). On anything else the
//serializer throws V3Unsupported; callers can fall back to the v2 engine.
import { readFileSync } from 'node:fs';
import { Position } from './fastPosition.js';

export class V3Unsupported extends Error {}

const wasmBytes = readFileSync(new URL('./v3/engine.wasm', import.meta.url));
const wasmModule = new WebAssembly.Module(wasmBytes);
const instance = new WebAssembly.Instance(wasmModule, {
  env: { now: () => Date.now() },
});
const ex = instance.exports;

//Accept a live Chess instance, a serialized chess.state(), or a Position
const toPosition = (input) => {
  if(input instanceof Position) { return input; }
  if(input && input.rawBoard) { return Position.fromState(input); }
  return Position.fromChess(input);
};

//Wire format: see parse() in engine-rs/src/lib.rs
const serialize = (pos) => {
  const b = pos.board;
  const buf = [pos.action | 0];
  const promos = pos.promotionPieces;
  if(promos == null) { buf.push(-1); }
  else {
    buf.push(promos.length);
    for(const p of promos) { buf.push(p); }
  }
  buf.push(b.length);
  const boards = [];
  for(let l = 0;l < b.length;l++) {
    const tl = b[l];
    if(!tl) { buf.push(0); continue; }
    buf.push(1, tl.length);
    for(let t = 0;t < tl.length;t++) {
      const turn = tl[t];
      if(!turn) { buf.push(-1); continue; }
      buf.push(boards.length);
      boards.push(turn);
    }
  }
  buf.push(boards.length);
  for(const turn of boards) {
    if(turn.length !== 8) { throw new V3Unsupported('v3 engine supports 8x8 boards only'); }
    for(let r = 0;r < 8;r++) {
      const rank = turn[r];
      if(!rank || rank.length !== 8) { throw new V3Unsupported('v3 engine supports 8x8 boards only'); }
      for(let f = 0;f < 8;f++) { buf.push(rank[f] | 0); }
    }
  }
  return buf;
};

const upload = (input) => {
  const buf = serialize(toPosition(input));
  const ptr = ex.v3_alloc(buf.length);
  new Int32Array(ex.memory.buffer, ptr, buf.length).set(buf);
  return buf.length;
};

const CLASSES = ['legal', 'illegal', 'unknown'];
const RESULTS = ['yes', 'no', 'timeout'];

//Same contract as legalMoves.classifyMoves: one class per move of
//chess.moves('object', false, false, false), same order.
export const classifyMoves = (input, totalBudgetMs = 4000, perMoveBudgetMs = 500) => {
  const len = upload(input);
  const rptr = ex.v3_classify(len, totalBudgetMs, perMoveBudgetMs);
  const mem = new Int32Array(ex.memory.buffer); //re-view: memory may have grown
  const base = rptr / 4;
  const n = mem[base];
  const res = new Array(n);
  for(let i = 0;i < n;i++) { res[i] = CLASSES[mem[base + 1 + i]]; }
  return res;
};

//Same contract as legalMoves.hasLegalAction: 'yes' | 'no' | 'timeout'
export const hasLegalAction = (input, budgetMs = 10000) => {
  const len = upload(input);
  return RESULTS[ex.v3_has_legal(len, budgetMs)];
};

//Raw move list as generated inside the wasm engine, in upstream order.
//For differential tests against Position.moves().
export const listMoves = (input) => {
  const len = upload(input);
  const rptr = ex.v3_list_moves(len);
  const mem = new Int32Array(ex.memory.buffer);
  let i = rptr / 4;
  const total = mem[i++];
  const end = i + total;
  const moves = [];
  while(i < end) {
    const nPos = mem[i++];
    const move = [];
    for(let k = 0;k < nPos;k++) {
      const nInts = mem[i++];
      move.push(Array.from(mem.subarray(i, i + nInts)));
      i += nInts;
    }
    moves.push(move);
  }
  return moves;
};
