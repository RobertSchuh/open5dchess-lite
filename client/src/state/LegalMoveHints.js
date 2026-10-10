//Legal move hints (optional, in-game settings): highlights pieces that have a
//legal move and shows only the moves that can still lead to a submittable
//action (see shared/legalMoves.js). The search runs in a worker; until a result
//is ready all moves are shown and no pieces are highlighted.
import LegalMovesWorker from 'utils/LegalMoves.worker.js?worker';
import { Position } from 'shared/fastPosition.js';
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
  //Hints are a per-player option: 'off' | 'white' | 'black' | 'both'.
  //Old saved settings may still hold a boolean; treat true as 'both'.
  enabled(player) {
    let mode = crConfig.get().extra.legalMoveHints;
    if(mode === true) { mode = 'both'; }
    return mode === 'both' || mode === player;
  }
  //Same position (including moves made so far this action) -> same key
  //(structural hash from the fast engine; chess.hash was an md5 of a FEN
  //export and showed up in profiles)
  key(chess) {
    return chess.rawAction + ':' + Position.fromChess(chess).hash();
  }
  //Returns { availableMoves, legalPieces } for getBoard().
  //legalPieces is null while hints are off or not computed yet.
  get(chess) {
    let moves = chess.moves('object', false, false, false);
    if(!this.enabled(chess.player)) { return { availableMoves: moves, legalPieces: null }; }
    let key = this.key(chess);
    if(key === this.resultKey && this.resultClasses && this.resultClasses.length === moves.length) {
      //'unknown' moves (search timed out) stay selectable: only proven-illegal
      //moves are hidden. Gold piece highlights need a proven legal move.
      let classes = this.resultClasses;
      let shownMoves = moves.filter((m, i) => classes[i] !== 'illegal');
      let pieces = new Map();
      moves.forEach((m, i) => {
        if(classes[i] !== 'legal') { return; }
        let s = m.start;
        pieces.set(`${s.timeline}_${s.turn}_${s.player}_${s.coordinate}`, s);
      });
      return { availableMoves: shownMoves, legalPieces: [...pieces.values()] };
    }
    this.request(key, chess);
    return { availableMoves: moves, legalPieces: null };
  }
  request(key, chess) {
    if(this.pending && this.pending.key === key) { return; }
    if(this.busy && this.busyKey === key) { return; }
    //postMessage's structured clone copies the raw board for the worker;
    //no serialization on this side
    this.pending = { key: key, state: { rawBoard: chess.rawBoard, rawAction: chess.rawAction, rawPromotionPieces: chess.rawPromotionPieces } };
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
