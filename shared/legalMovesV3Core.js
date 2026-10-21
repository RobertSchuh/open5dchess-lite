//Environment-independent part of the v3 engine wrapper: position
//serialization plus the call surface over an instantiated WASM module.
//Node loads the module synchronously (legalMovesV3.js); the browser hints
//worker fetches and instantiates it asynchronously (LegalMoves.worker.js).
import { Position } from './fastPosition.js';

export class V3Unsupported extends Error {}

//Accept a live Chess instance, a serialized chess.state(), or a Position
export const toPosition = (input) => {
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

//The raw wire buffer for a position, for offline tooling (native profiler)
export const toBuffer = (input) => serialize(toPosition(input));

const CLASSES = ['legal', 'illegal', 'unknown'];
const RESULTS = ['yes', 'no', 'timeout'];

//The full engine API over an instantiated wasm module (needs env.now import)
export const makeEngine = (instance) => {
  const ex = instance.exports;

  const upload = (input) => {
    const buf = serialize(toPosition(input));
    const ptr = ex.v3_alloc(buf.length);
    new Int32Array(ex.memory.buffer, ptr, buf.length).set(buf);
    return buf.length;
  };

  const classifyMoves = (input, totalBudgetMs = 4000, perMoveBudgetMs = 500) => {
    const len = upload(input);
    const rptr = ex.v3_classify(len, totalBudgetMs, perMoveBudgetMs);
    const mem = new Int32Array(ex.memory.buffer); //re-view: memory may have grown
    const base = rptr / 4;
    const n = mem[base];
    const res = new Array(n);
    for(let i = 0;i < n;i++) { res[i] = CLASSES[mem[base + 1 + i]]; }
    return res;
  };

  //The DFS search (the original v3 prover; kept as watchdog and fallback)
  const hasLegalActionDfs = (input, budgetMs = 10000) => {
    const len = upload(input);
    return RESULTS[ex.v3_has_legal(len, budgetMs)];
  };

  //The hypercuboid search: proves deep travel-mates the DFS cannot
  const hasLegalActionHc = (input, budgetMs = 10000) => {
    const len = upload(input);
    return RESULTS[ex.v3_has_legal_hc(len, budgetMs)];
  };

  //Same contract as legalMoves.hasLegalAction: 'yes' | 'no' | 'timeout'.
  //Hypercuboid is the main prover; on its (rare) timeout the DFS gets the
  //remaining budget as insurance against pathological fragmentation.
  const hasLegalAction = (input, budgetMs = 10000) => {
    const t0 = Date.now();
    const r = hasLegalActionHc(input, budgetMs * 0.7);
    if(r !== 'timeout') { return r; }
    const left = budgetMs - (Date.now() - t0);
    return left > 50 ? hasLegalActionDfs(input, left) : 'timeout';
  };

  //Complete one move (index into the Position.moves() / listMoves order) into
  //a full legal action. Returns { result: 'yes'|'no'|'timeout', moves: [ids] }
  //where moves are indices into the same list, in required apply order.
  const completeAction = (input, moveIdx, budgetMs = 2000) => {
    const len = upload(input);
    const rptr = ex.v3_complete_action(len, budgetMs, moveIdx);
    const mem = new Int32Array(ex.memory.buffer);
    const base = rptr / 4;
    const result = RESULTS[mem[base]];
    const n = mem[base + 1];
    return { result, moves: Array.from(mem.subarray(base + 2, base + 2 + n)) };
  };

  //Raw move list as generated inside the wasm engine, in upstream order.
  //For differential tests against Position.moves().
  const listMoves = (input) => {
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

  return { classifyMoves, hasLegalAction, hasLegalActionDfs, hasLegalActionHc, completeAction, listMoves };
};
