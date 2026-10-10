//Web worker: runs the legal move search (utils/LegalMoves) off the main thread.
import Chess from '5d-chess-js';
import { classifyMoves, trimState } from 'shared/legalMoves.js';

self.onmessage = (e) => {
  const { key, state } = e.data;
  let classes = null;
  try {
    let chess = new Chess();
    chess.state(trimState(state));
    chess.skipDetection = true;
    classes = classifyMoves(chess);
  }
  catch(err) {
    console.error(err);
  }
  self.postMessage({ key, classes });
};
