// Web worker wrapper (replaces CRA's workerize-loader): runs the slow
// notation-highlight search off the main thread.
import { extractHighlightNotation } from './HighlightNotationWorker';

self.onmessage = (e) => {
  const { id, args } = e.data;
  let result = null;
  try {
    result = extractHighlightNotation(...args);
  }
  catch(err) {
    console.error(err);
  }
  self.postMessage({ id, result });
};
