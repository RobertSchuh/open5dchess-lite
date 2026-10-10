//Fast 5D chess position for search (legal-move classification, mate/stalemate
//detection, threat analysis).
//
//Move SEMANTICS (generation and application) come verbatim from the vendored
//upstream code in ./engine/ (see engine/README.md): identical moves by
//construction. What this class replaces is the plumbing that made search
//slow in 5d-chess-js:
//  - chess.copy(): deep-copied every board of the multiverse per node.
//    Boards are immutable once written, so clone() shallow-copies only the
//    two outer array levels; boards are shared (copy-on-write).
//  - chess.inCheck / checks(): deep-copied the whole board again and built
//    the full opponent move list. Here: reference-appended blank turns and
//    per-piece early exit.
//  - chess.hash: md5 of a FEN export. Here: FNV-1a over board ints, cached
//    per board object (boards are shared between clones, so cache hits).
//
//Raw format reminder (from 5d-chess-js):
//  board[l][t][rank][file] = signed piece int (negative = unmoved,
//  odd = white, even = black), l: 0=L0, odd=L1,L2.., even=L-1,L-2..,
//  t: parity = player to move next on that board (t%2===action%2 -> the
//  player of `action` may move there). A move is [start, dest, ...] with
//  positions [l, t, rank, file(, promotion)].
import * as boardFuncs from './engine/board.js';
import * as pieceFuncs from './engine/piece.js';

//--- content hashes for boards, cached per board object ---------------------
const boardHashes = new WeakMap();
const hashBoard = (turn) => {
  let cached = boardHashes.get(turn);
  if(cached !== undefined) { return cached; }
  let h1 = 0x811c9dc5 | 0;
  let h2 = 0x01000193 | 0;
  for(let r = 0;r < turn.length;r++) {
    const rank = turn[r];
    for(let f = 0;f < rank.length;f++) {
      const v = rank[f] | 0;
      h1 = Math.imul(h1 ^ v, 0x01000193);
      h2 = (Math.imul(h2, 31) + v + r * 131 + f * 7) | 0;
    }
  }
  cached = (h1 >>> 0) * 0x100000000 + (h2 >>> 0);
  boardHashes.set(turn, cached);
  return cached;
};

//--- lean king-capture scanner ----------------------------------------------
//Mirrors exactly the capture-generating paths of pieceFuncs.moves (vendored
//upstream code), but probes destinations without building move arrays and
//stops at the first king capture. Castling cannot capture; en passant only
//captures pawns; pure forward pawn moves need empty squares: all skipped.
//(One deliberate difference: a promotion-capture of a king is reported once,
//not once per promotion piece. Only the set of (start, dest) pairs is used.)

//movePos/moveVecs allocate their tables on every call upstream; cache them.
const movePosCache = new Map();
const moveVecsCache = new Map();
const tablesFor = (absPiece) => {
  let pos = movePosCache.get(absPiece);
  if(pos === undefined) { pos = pieceFuncs.movePos(absPiece); movePosCache.set(absPiece, pos); }
  let vecs = moveVecsCache.get(absPiece);
  if(vecs === undefined) { vecs = pieceFuncs.moveVecs(absPiece); moveVecsCache.set(absPiece, vecs); }
  return [pos, vecs];
};
//How many leading movePos/moveVecs entries are spatial (same table as upstream)
const SPATIAL_LENGTH = [
  0, 0, 4, 4, 8, 8, 4, 4,
  8, 8, 8, 8, 8, 8, 0, 0,
  8, 8, 8, 8, 0, 0, 0, 0,
];

const isKingOf = (destPiece, kingColor) => {
  const target = destPiece < 0 ? -destPiece : destPiece;
  return (target === 11 || target === 12 || target === 19 || target === 20) && target % 2 === kingColor;
};

//Spatial (same-board) king captures, cached per board object: boards are
//immutable and shared between search nodes, so each unique board is scanned
//once per king colour. Returns a list of [r1, f1, r2, f2] attack pairs.
const spatialCheckCache = new WeakMap();
const spatialKingCaptures = (curBoard, kingColor) => {
  let cached = spatialCheckCache.get(curBoard);
  if(cached === undefined) {
    cached = [null, null];
    spatialCheckCache.set(curBoard, cached);
  }
  if(cached[kingColor] !== null) { return cached[kingColor]; }
  const oppParity = 1 - kingColor;
  const pairs = [];
  for(let r = 0;r < curBoard.length;r++) {
    const rank = curBoard[r];
    for(let f = 0;f < rank.length;f++) {
      const piece = rank[f];
      if(piece === 0) { continue; }
      const absPiece = piece < 0 ? -piece : piece;
      if(absPiece % 2 !== oppParity) { continue; }
      if(absPiece === 1 || absPiece === 2 || absPiece === 15 || absPiece === 16) {
        //Pawn/brawn spatial diagonal captures
        const forward = (absPiece % 2 === 1) ? -1 : 1;
        const rPos = r + forward;
        if(rPos < 0 || rPos >= curBoard.length) { continue; }
        for(const fPos of [f + 1, f - 1]) {
          if(fPos < 0 || fPos >= curBoard[rPos].length) { continue; }
          if(isKingOf(curBoard[rPos][fPos], kingColor)) { pairs.push([r, f, rPos, fPos]); }
        }
        continue;
      }
      const [movePos, moveVecs] = tablesFor(absPiece);
      const spatial = SPATIAL_LENGTH[absPiece - 1];
      for(let i = 0;i < spatial && i < movePos.length;i++) {
        const rPos = r + movePos[i][2];
        const fPos = f + movePos[i][3];
        if(rPos < 0 || rPos >= curBoard.length || fPos < 0 || fPos >= curBoard[rPos].length) { continue; }
        if(isKingOf(curBoard[rPos][fPos], kingColor)) { pairs.push([r, f, rPos, fPos]); }
      }
      for(let i = 0;i < spatial && i < moveVecs.length;i++) {
        const rMove = moveVecs[i][2];
        const fMove = moveVecs[i][3];
        let rPos = r + rMove;
        let fPos = f + fMove;
        while(rPos >= 0 && rPos < curBoard.length && fPos >= 0 && fPos < curBoard[rPos].length) {
          const destPiece = curBoard[rPos][fPos];
          if(destPiece !== 0) {
            if(isKingOf(destPiece, kingColor)) { pairs.push([r, f, rPos, fPos]); }
            break;
          }
          rPos += rMove;
          fPos += fMove;
        }
      }
    }
  }
  cached[kingColor] = pairs;
  return pairs;
};

const scanPieceKingCaptures = (board, l, t, r, f, piece, kingColor, detectionOnly, res) => {
  const absPiece = piece < 0 ? -piece : piece;
  const pieceColor = absPiece % 2;
  const curBoard = board[l][t];
  const isEven = boardFuncs.isEvenTimeline(board);
  const start = [l, t, r, f];
  const hit = (dest) => {
    if(detectionOnly) { return true; }
    res.push([start, dest]);
    return false;
  };

  if(absPiece === 1 || absPiece === 2 || absPiece === 15 || absPiece === 16) {
    const forward = (pieceColor === 1) ? -1 : 1;
    //(spatial diagonal captures come from the per-board cache)
    //Timeline captures: (timelineMove(l, -forward), t±2, same square)
    const lCap = pieceFuncs.timelineMove(l, -forward, isEven);
    for(const tCap of [t + 2, t - 2]) {
      const dest = [lCap, tCap, r, f];
      if(!boardFuncs.positionExists(board, dest)) { continue; }
      const destPiece = board[lCap][tCap][r][f];
      if(destPiece !== 0 && Math.abs(destPiece) % 2 !== pieceColor && isKingOf(destPiece, kingColor)) {
        if(hit(dest)) { return true; }
      }
    }
    //Brawn-specific captures
    if(absPiece === 15 || absPiece === 16) {
      for(const [dl, dt, dy, dx] of [[-forward, 0, 0, 1], [-forward, 0, 0, -1], [-forward, 0, forward, 0], [0, -1, forward, 0]]) {
        const dest = [pieceFuncs.timelineMove(l, dl, isEven), t + 2 * dt, r + dy, f + dx];
        if(!boardFuncs.positionExists(board, dest)) { continue; }
        const destPiece = board[dest[0]][dest[1]][dest[2]][dest[3]];
        if(destPiece !== 0 && Math.abs(destPiece) % 2 !== pieceColor && isKingOf(destPiece, kingColor)) {
          if(hit(dest)) { return true; }
        }
      }
    }
    return false;
  }

  const [movePos, moveVecs] = tablesFor(absPiece);
  const spatial = SPATIAL_LENGTH[absPiece - 1];
  //Single-square 4D moves (spatial ones come from the per-board cache)
  for(let i = spatial;i < movePos.length;i++) {
    const dest = [pieceFuncs.timelineMove(l, movePos[i][0], isEven), t + movePos[i][1] * 2, r + movePos[i][2], f + movePos[i][3]];
    if(!boardFuncs.positionExists(board, dest)) { continue; }
    const destPiece = board[dest[0]][dest[1]][dest[2]][dest[3]];
    if(destPiece !== 0 && Math.abs(destPiece) % 2 !== pieceColor && isKingOf(destPiece, kingColor)) {
      if(hit(dest)) { return true; }
    }
  }
  //Sliding 4D moves: only the first occupied square on a ray matters
  for(let i = spatial;i < moveVecs.length;i++) {
    {
      const lMove = moveVecs[i][0];
      const tMove = moveVecs[i][1] * 2;
      const rMove = moveVecs[i][2];
      const fMove = moveVecs[i][3];
      const cur = [pieceFuncs.timelineMove(l, lMove, isEven), t + tMove, r + rMove, f + fMove];
      while(boardFuncs.positionExists(board, cur)) {
        const destPiece = board[cur[0]][cur[1]][cur[2]][cur[3]];
        if(destPiece !== 0) {
          if(Math.abs(destPiece) % 2 !== pieceColor && isKingOf(destPiece, kingColor)) {
            if(hit([cur[0], cur[1], cur[2], cur[3]])) { return true; }
          }
          break;
        }
        cur[0] = pieceFuncs.timelineMove(cur[0], lMove, isEven);
        cur[1] += tMove;
        cur[2] += rMove;
        cur[3] += fMove;
      }
    }
  }
  return false;
};


export class Position {
  //board is borrowed read-only; every mutating operation works on a clone()
  constructor(board, action, promotionPieces = null) {
    this.board = board;
    this.action = action;
    this.promotionPieces = promotionPieces;
  }
  //Zero-copy view of a live 5d-chess-js instance (server side)
  static fromChess(chess) {
    return new Position(chess.rawBoard, chess.rawAction, chess.rawPromotionPieces);
  }
  //From a serialized chess.state() (already a private copy; e.g. in a worker)
  static fromState(state) {
    return new Position(state.rawBoard, state.rawAction, state.rawPromotionPieces);
  }
  get player() { return this.action % 2 === 0 ? 'white' : 'black'; }

  //Copy-on-write clone: outer arrays copied, boards shared
  clone() {
    const b = this.board;
    const res = new Array(b.length);
    for(let l = 0;l < b.length;l++) { res[l] = b[l] ? b[l].slice() : b[l]; }
    return new Position(res, this.action, this.promotionPieces);
  }

  //All moves for the player to move: same code, same order as
  //chess.moves('object'/raw, false, false, false) in 5d-chess-js.
  moves() {
    return boardFuncs.moves(this.board, this.action, false, false, false, this.promotionPieces);
  }

  //Apply one raw move IN PLACE (call on an owned clone, never on a borrowed
  //root). Upstream board.move only creates new turns and writes to the outer
  //arrays, so shared boards are never touched.
  apply(move) {
    boardFuncs.move(this.board, move);
    return this;
  }

  //Playable boards that still must be moved on before submitting
  present() {
    return boardFuncs.present(this.board, this.action);
  }

  //Is `player of action` in check: could the opponent capture one of their
  //kings next action? Mirrors mateFuncs.checks(board, action, true) exactly,
  //but without the deep copy and with early exit.
  inCheck() {
    return this.#checks(true);
  }
  //Full list of raw king-capture moves (same set as mateFuncs.checks(board, action))
  checksList() {
    return this.#checks(false);
  }
  //Reference check scan (full move generation per piece); kept for
  //differential tests against the lean scanner below.
  checksViaMovegen(detectionOnly) {
    return this.#checks(detectionOnly, true);
  }
  #checks(detectionOnly, viaMovegen = false) {
    const action = this.action;
    const kingColor = action % 2;
    //blankAction on a throwaway clone: extend present timelines by their own
    //latest board (reference append; boards are immutable so no copy needed)
    const tmp = new Array(this.board.length);
    for(let l = 0;l < this.board.length;l++) { tmp[l] = this.board[l] ? this.board[l].slice() : this.board[l]; }
    const presentTimelines = boardFuncs.present(tmp, action);
    for(const l of presentTimelines) {
      const tl = tmp[l];
      if(!tl) { continue; }
      if((tl.length - 1) % 2 !== action % 2) { continue; }
      tl[tl.length] = tl[tl.length - 1];
    }
    //Opponent moves (action+1) from every timeline latest board, per piece,
    //searching for a capture of our king / royal queen
    const res = [];
    const oppParity = (action + 1) % 2;
    for(let l = 0;l < tmp.length;l++) {
      const tl = tmp[l];
      if(!tl) { continue; }
      const t = tl.length - 1;
      if(t % 2 !== oppParity) { continue; }
      const latest = tl[t];
      if(!latest) { continue; }
      if(!viaMovegen) {
        //Same-board attacks, cached per board object
        for(const [r1, f1, r2, f2] of spatialKingCaptures(latest, kingColor)) {
          if(detectionOnly) { return true; }
          res.push([[l, t, r1, f1], [l, t, r2, f2]]);
        }
      }
      for(let r = 0;r < latest.length;r++) {
        const rank = latest[r];
        for(let f = 0;rank && f < rank.length;f++) {
          const piece = Math.abs(rank[f]);
          if(piece === 0 || piece % 2 !== oppParity) { continue; }
          if(viaMovegen) {
            const pieceMoves = pieceFuncs.moves(tmp, [l, t, r, f], false, this.promotionPieces);
            for(const move of pieceMoves) {
              if(move.length !== 2) { continue; }
              const dest = move[1];
              if(!boardFuncs.positionExists(tmp, dest)) { continue; }
              const target = Math.abs(tmp[dest[0]][dest[1]][dest[2]][dest[3]]);
              if((target === 11 || target === 12 || target === 19 || target === 20) && target % 2 === kingColor) {
                if(detectionOnly) { return true; }
                res.push(move);
              }
            }
          }
          else if(scanPieceKingCaptures(tmp, l, t, r, f, rank[f], kingColor, detectionOnly, res)) {
            return true;
          }
        }
      }
    }
    return detectionOnly ? false : res;
  }

  //Same as chess.submittable() with skipDetection: not in check, and no
  //present board left to move on
  submittable() {
    if(this.present().length > 0) { return false; }
    return !this.inCheck();
  }

  //Submitting changes no boards, only whose action it is
  submit() {
    return new Position(this.board, this.action + 1, this.promotionPieces);
  }
  //Pass: blank moves on all present boards, then submit (mate.blankAction)
  pass() {
    const res = this.clone();
    const presentTimelines = boardFuncs.present(res.board, res.action);
    for(const l of presentTimelines) {
      const tl = res.board[l];
      if(!tl) { continue; }
      if((tl.length - 1) % 2 !== res.action % 2) { continue; }
      tl[tl.length] = tl[tl.length - 1];
    }
    res.action += 1;
    return res;
  }

  //Structural hash for search dedup (content-based, so equal positions hash
  //equal even when the board objects differ)
  hash() {
    let h = 0x9e3779b9 | 0;
    const b = this.board;
    for(let l = 0;l < b.length;l++) {
      const tl = b[l];
      if(!tl) { continue; }
      //Only the latest board per timeline can differ between siblings of one
      //action... but new timelines/new turns matter too: fold length and the
      //last two boards (a move touches at most the tips).
      h = Math.imul(h ^ (l + 1), 0x85ebca6b);
      h = Math.imul(h ^ tl.length, 0xc2b2ae35);
      for(let t = Math.max(0, tl.length - 2);t < tl.length;t++) {
        if(!tl[t]) { continue; }
        const bh = hashBoard(tl[t]);
        h = Math.imul(h ^ (bh & 0xffffffff), 0x27d4eb2f);
        h = (h ^ Math.floor(bh / 0x100000000) ^ t) | 0;
      }
    }
    return h >>> 0;
  }
}
