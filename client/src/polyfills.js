// Node globals that some old browser-ified dependencies (nedb, util) expect.
// Must be the first import in index.jsx so it runs before those modules load.
import { Buffer } from 'buffer';

// Another dependency may already have set a partial `process`; fill in gaps.
const processShim = {
  env: {},
  browser: true,
  version: '',
  versions: {},
  platform: 'browser',
  cwd: () => '/',
  nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)),
};
globalThis.process = Object.assign(processShim, globalThis.process || {});
globalThis.Buffer = globalThis.Buffer || Buffer;
globalThis.global = globalThis.global || globalThis;
