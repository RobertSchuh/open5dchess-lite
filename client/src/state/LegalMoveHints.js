//Legal move hints (optional, in-game settings): highlights pieces that have a
//legal move and shows only the moves that can still lead to a submittable
//action (see shared/legalMoves.js). The search runs in a worker; until a result
//is ready all moves are shown and no pieces are highlighted.
import LegalMovesWorker from 'utils/LegalMoves.worker.js?worker';
import * as crConfig from 'state/config';

export default class LegalMoveHints {
  //onReady() is called when a new result arrives, so the board can redraw
  constructor(onReady) {
    this.onReady = onReady;
    this.worker = null;
    this.busy = false;
    this.pending = null;   //latest request waiting for the worker
    this.resultKey = null;
    this.resultClasses = null;
  }
  enabled() {
    return crConfig.get().extra.legalMoveHints === true;
  }
  //Same position (including moves made so far this action) -> same key
  key(chess) {
    return chess.actionHistory.length + ':' + chess.hash;
  }
  //Returns { availableMoves, legalPieces } for getBoard().
  //legalPieces is null while hints are off or not computed yet.
  get(chess) {
    let moves = chess.moves('object', false, false, false);
    if(!this.enabled()) { return { availableMoves: moves, legalPieces: null }; }
    let key = this.key(chess);
    if(key === this.resultKey && this.resultClasses && this.resultClasses.length === moves.length) {
      //'unknown' moves are kept: only proven-illegal moves are hidden
      let legalMoves = moves.filter((m, i) => this.resultClasses[i] !== 'illegal');
      //One highlight per piece (start square) that has at least one legal move
      let pieces = new Map();
      for(let m of legalMoves) {
        let s = m.start;
        pieces.set(`${s.timeline}_${s.turn}_${s.player}_${s.coordinate}`, s);
      }
      return { availableMoves: legalMoves, legalPieces: [...pieces.values()] };
    }
    this.request(key, chess);
    return { availableMoves: moves, legalPieces: null };
  }
  request(key, chess) {
    if(this.pending && this.pending.key === key) { return; }
    if(this.busy && this.busyKey === key) { return; }
    this.pending = { key: key, state: chess.state() };
    this.sendNext();
  }
  sendNext() {
    if(this.busy || !this.pending) { return; }
    if(this.worker === null) {
      this.worker = new LegalMovesWorker();
      this.worker.onmessage = (e) => {
        this.busy = false;
        this.resultKey = e.data.key;
        this.resultClasses = e.data.classes;
        if(this.pending) {
          this.sendNext();
        }
        else if(typeof this.onReady === 'function') {
          this.onReady();
        }
      };
    }
    this.busy = true;
    this.busyKey = this.pending.key;
    this.worker.postMessage(this.pending);
    this.pending = null;
  }
  destroy() {
    if(this.worker !== null) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
