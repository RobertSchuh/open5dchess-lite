//Online game over a WebSocket to our server. The server is authoritative:
//it validates every action and sends the full game state back. We replay
//that state into a local engine so the existing Player UI can draw it.
//Same event names and getBoard() shape as SessionManager.
import Chess from '5d-chess-js';
import { createNanoEvents } from 'nanoevents';

import LegalMoveHints from 'state/LegalMoveHints';
import { socketUrl } from 'network/online';

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 10000;

export default class OnlineGameManager {
  constructor(gameId, seat) {
    this.gameId = gameId;
    this.seatToken = seat;
    this.emitter = createNanoEvents();
    this.legalHints = new LegalMoveHints(() => { this.refreshBoard(); });
    this.chess = null;
    this.state = null;        //last state from the server
    this.receivedAt = 0;
    this.ws = null;
    this.closed = false;
    this.gone = false;
    this.retryMs = RECONNECT_MIN_MS;
    this.onVisible = () => {
      //Phones drop sockets while asleep: reconnect right away when shown again
      if(document.visibilityState === 'visible' && !this.isOpen()) { this.connect(); }
    };
    document.addEventListener('visibilitychange', this.onVisible);
  }
  on(event, callback) {
    //onBoardUpdate, onClockUpdate, onStateUpdate, onConnection, onError, onEnd
    return this.emitter.on(event, callback);
  }
  isOpen() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
  connect() {
    if(this.closed || this.gone) { return; }
    if(this.ws !== null && this.ws.readyState <= WebSocket.OPEN) { return; }
    clearTimeout(this.retryTimer);
    let ws = new WebSocket(socketUrl(this.gameId, this.seatToken));
    this.ws = ws;
    ws.onopen = () => {
      this.retryMs = RECONNECT_MIN_MS;
      this.emitter.emit('onConnection', true);
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch(err) { return; }
      if(msg.type === 'state') { this.applyState(msg.state); }
      else if(msg.type === 'error') { this.emitter.emit('onError', msg.message); }
      else if(msg.type === 'gone') { this.gone = true; this.emitter.emit('onError', 'This game has expired.'); }
    };
    ws.onclose = (e) => {
      if(this.ws !== ws) { return; }
      this.emitter.emit('onConnection', false);
      if(e.code === 4404) { this.gone = true; }
      if(this.closed || this.gone) { return; }
      //Before the first state arrives a close means bad link / unknown game
      if(this.state === null && this.failedAttempts >= 2) {
        this.emitter.emit('onError', 'Could not join this game. The link may be wrong or the game expired.');
        return;
      }
      this.failedAttempts = this.state === null ? (this.failedAttempts || 0) + 1 : 0;
      this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, RECONNECT_MAX_MS);
    };
  }
  send(msg) {
    if(this.isOpen()) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    this.emitter.emit('onError', 'Not connected, reconnecting...');
    this.connect();
    return false;
  }

  //Rebuild the local engine from the server's action history and move buffer
  applyState(state) {
    let prev = this.state;
    this.state = state;
    this.receivedAt = Date.now();
    let chess = new Chess();
    chess.skipDetection = true; //the server already validated everything
    chess.reset(state.variant);
    for(let action of state.actionHistory) {
      for(let move of action.moves) { chess.move(move); }
      chess.submit();
    }
    for(let move of state.moveBuffer) { chess.move(move); }
    this.chess = chess;
    this.emitter.emit('onStateUpdate', state);
    this.refreshBoard();
    this.emitter.emit('onClockUpdate', this.getClock());
    if(state.result && !(prev && prev.result)) {
      this.emitter.emit('onEnd', state.result);
    }
  }

  get seat() { return this.state ? this.state.you : null; }
  myTurn() {
    return this.state !== null && !this.state.result && this.state.player === this.state.you;
  }
  getBoard() {
    let chess = this.chess;
    let myTurn = this.myTurn();
    let hints = myTurn ? this.legalHints.get(chess) : { availableMoves: [], legalPieces: null };
    //Highlight what the opponent did on their last submitted action: the
    //square each piece left and the square it actually landed on (realEnd
    //points into the board the move created, incl. new timelines).
    let lastMoves = [];
    let lastAction = chess.actionHistory[chess.actionHistory.length - 1];
    if(lastAction && this.state && lastAction.player !== this.state.you) {
      for(let m of lastAction.moves) {
        lastMoves.push(m.start, m.realEnd || m.end);
      }
    }
    return {
      lastMoves,
      player: chess.player,
      board: chess.board,
      actionHistory: chess.actionHistory,
      moveBuffer: chess.moveBuffer,
      checks: chess.checks(),
      availableMoves: hints.availableMoves,
      legalPieces: hints.legalPieces,
      pastAvailableMoves: [],
      undoable: myTurn && chess.undoable(),
      submittable: myTurn && chess.submittable(),
      notation: chess.export('5dpgn_active_timeline'),
    };
  }
  refreshBoard() {
    if(this.chess === null) { return; }
    this.emitter.emit('onBoardUpdate', this.getBoard());
  }
  //Clock as the Clock component expects it, corrected for time since receipt
  getClock() {
    let clock = this.state && this.state.clock;
    if(!clock) { return null; }
    let res = Object.assign({}, clock);
    if(clock.running && !this.state.result) {
      let elapsed = Date.now() - this.receivedAt;
      let p = clock.player;
      let delay = Math.max(0, res[`${p}DelayLeft`] - elapsed);
      let spill = Math.max(0, elapsed - res[`${p}DelayLeft`]);
      res[`${p}DelayLeft`] = delay;
      res[`${p}DurationLeft`] = Math.max(0, res[`${p}DurationLeft`] - spill);
    }
    return res;
  }

  //Actions: applied locally right away for a snappy feel, then the server's
  //state replaces ours (and corrects us if it rejected the action).
  //The renderer's move objects have circular references (highlights), so
  //send the move in 5DPGN notation, matched against the engine's move list.
  toNotation(move) {
    const key = (m) => JSON.stringify([m.start.timeline, m.start.turn, m.start.coordinate, m.end.timeline, m.end.turn, m.end.coordinate]);
    const objects = this.chess.moves('object', false, false, false);
    const names = this.chess.moves('5dpgn', false, false, false).trim().split('\n');
    const wanted = key(move);
    const promotion = Array.isArray(move.promotion) ? move.promotion[0] : move.promotion;
    for(let i = 0;i < objects.length;i++) {
      if(key(objects[i]) === wanted && (objects[i].promotion || null) === (promotion || null)) {
        return names[i];
      }
    }
    return null;
  }
  move(move) {
    if(!this.myTurn()) { return; }
    const notation = this.toNotation(move);
    if(notation === null) {
      this.emitter.emit('onError', 'Move not available');
      return;
    }
    if(this.send({ type: 'move', move: notation })) {
      try { this.chess.move(move); this.refreshBoard(); } catch(err) {}
    }
  }
  undo() {
    if(!this.myTurn()) { return; }
    if(this.send({ type: 'undo' })) {
      try { this.chess.undo(); this.refreshBoard(); } catch(err) {}
    }
  }
  submit() {
    if(!this.myTurn()) { return; }
    this.send({ type: 'submit' });
  }
  resign() {
    this.send({ type: 'resign' });
  }
  rematch() {
    this.send({ type: 'rematch' });
  }
  setNickname(nickname) {
    this.send({ type: 'nickname', nickname: nickname });
  }
  destroy() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    document.removeEventListener('visibilitychange', this.onVisible);
    if(this.ws !== null) { this.ws.close(1000); }
    this.legalHints.destroy();
    this.emitter.events = {};
  }
}
