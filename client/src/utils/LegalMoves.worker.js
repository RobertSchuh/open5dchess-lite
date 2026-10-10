//Web worker: runs the legal move search (shared/legalMoves, fast engine) off
//the main thread. Receives { key, state: { rawBoard, rawAction,
//rawPromotionPieces } } and answers { key, classes }.
import { classifyMoves } from 'shared/legalMoves.js';

self.onmessage = (e) => {
  const { key, state } = e.data;
  let classes = null;
  try {
    classes = classifyMoves(state);
  }
  catch(err) {
    console.error(err);
  }
  self.postMessage({ key, classes });
};
