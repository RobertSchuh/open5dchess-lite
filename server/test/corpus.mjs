//Position corpus for differential tests and benchmarks: Robert's real games
//plus deterministic random games biased toward time travel.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Chess = require('5d-chess-js');

//Robert's games (2026-10-10), one action per entry
export const GAMES = {
  //First test game: "seems checkmate, but game says check" (turn zero)
  mateAcrossTime: { variant: 'turn_zero', actions: ['e3', 'e6', 'Qf3', 'Nc6', 'Na3', 'Nb4', 'Nb5', 'Nxa2', 'Rxa2', 'a6', 'Nxc7', 'Qxc7', '(0T7)Qf3>>x(0T3)f7~', '(0T7)Qc7>>x(0T2)c2~', '(-1T3)Qxf7'] },
  //Second game: check on L-2, highlight bug report
  checkOnL2: { variant: 'standard', actions: ['e3', 'e6', 'Qf3', 'Nc6', 'Na3', 'Nb4', 'Nb5', 'Nxc2', 'Kd1', 'Nxa1', 'Nxc7', 'Qxc7', '(0T7)Qf3>>x(0T3)f7~', '(0T7)Qc7>>x(0T2)c2~', '(-1T3)Bd3', '(-1T3)Qc2>>(0T2)d1~', '(-2T3)Kxd1'] },
  //Claude (Black) vs rob: queen travels back to mate on f7
  claudeVsRob: { variant: 'standard', actions: ['e3', 'e5', 'Qf3', 'Nf6', 'Nc3', 'Nc6', 'Nd5', 'Nxd5', 'e4', 'Ndb4', 'c3', 'Nc2', 'Kd1', 'Nxa1', 'a3', 'Nb3', '(0T9)Qf3>>x(0T5)f7~'] },
};

//Every position (after each action) of a game
export const positionsOf = (variant, actions) => {
  const res = [];
  const chess = new Chess();
  chess.skipDetection = true;
  chess.reset(variant);
  res.push(chess.copy());
  for(const a of actions) {
    chess.move(a);
    chess.submit();
    res.push(chess.copy());
  }
  return res;
};

//Deterministic random games biased toward time travel
export const randomGames = (seeds, maxActions = 12) => {
  const games = [];
  for(const seed0 of seeds) {
    let seed = seed0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const chess = new Chess();
    chess.skipDetection = true;
    const positions = [chess.copy()];
    for(let a = 0;a < maxActions;a++) {
      const staged = randomAction(chess, rnd, Date.now() + 1500);
      if(!staged) { break; }
      staged.submit();
      //Keep the corpus small enough for the reference engine
      if(staged.rawBoard.filter(Boolean).length > 6) { break; }
      positions.push(staged.copy());
      chess.state(staged.state());
    }
    games.push(positions);
  }
  return games;
};
const randomAction = (chess, rnd, deadline) => {
  if(chess.submittable()) { return chess; }
  if(Date.now() > deadline) { return null; }
  const moves = chess.moves('object', false, false, false);
  //Shuffle with a bias for time-travel moves
  const score = (m) => (m.start.timeline !== m.end.timeline || m.start.turn !== m.end.turn ? 1 : 0) + rnd();
  moves.sort((a, b) => score(b) - score(a));
  for(const m of moves.slice(0, 10)) {
    const next = chess.copy();
    try { next.move(m); } catch(err) { continue; }
    const done = randomAction(next, rnd, deadline);
    if(done) { return done; }
  }
  return null;
};

