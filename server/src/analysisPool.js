// Worker-thread pool for game analysis, so one game's search never blocks
// the event loop (moves, clocks, other games). Sized for small machines:
// workers spawn lazily on first use and shut down after sitting idle, so an
// idle server holds no extra memory (matters on the Pi's 1 GB).
//
// Every job has a hard wall-clock cap: a runaway job gets its worker
// terminated and respawned, and the job falls back to running inline.
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { classifyMoves, hasLegalAction } from '../../shared/legalMovesV3.js';
import { threats } from './describe.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Chess = require('5d-chess-js');

const WORKER_URL = new URL('./analysisWorker.js', import.meta.url);

const inline = (type, state, args) => {
  if(type === 'classify') { return classifyMoves(state, ...args); }
  if(type === 'hasLegalAction') { return hasLegalAction(state, ...args); }
  if(type === 'threats') {
    const chess = new Chess();
    chess.state(state);
    chess.skipDetection = true;
    return threats(chess, ...args);
  }
  throw new Error(`Unknown job type ${type}`);
};

export class AnalysisPool {
  constructor({
    size = Number(process.env.ANALYSIS_WORKERS || Math.min(2, Math.max(1, os.availableParallelism() - 1))),
    idleMs = 60 * 1000,
    graceMs = 5 * 1000,
  } = {}) {
    this.size = Math.max(1, size);
    this.idleMs = idleMs;
    this.graceMs = graceMs;
    this.workers = []; // { worker, busy, job }
    this.queue = [];
    this.nextId = 1;
    this.destroyed = false;
  }

  // run('classify'|'hasLegalAction'|'threats', trimmedState, [args], budgetMs)
  // -> Promise. budgetMs is what the search itself is allowed; the job is
  // killed at budgetMs + grace and then computed inline as a fallback.
  run(type, state, args = [], budgetMs = 10000) {
    if(this.destroyed) { return Promise.resolve(inline(type, state, args)); }
    return new Promise((resolve) => {
      const job = { id: this.nextId++, type, state, args, budgetMs, resolve, started: null, timer: null };
      this.queue.push(job);
      this.#pump();
    }).catch(() => inline(type, state, args));
  }

  #pump() {
    while(this.queue.length > 0) {
      let slot = this.workers.find((s) => !s.busy);
      if(!slot && this.workers.length < this.size) {
        slot = this.#spawn();
      }
      if(!slot) { return; } // all busy; jobs wait in queue
      const job = this.queue.shift();
      slot.busy = true;
      slot.job = job;
      clearTimeout(slot.idleTimer);
      job.timer = setTimeout(() => this.#kill(slot, 'analysis job exceeded its budget'), job.budgetMs + this.graceMs);
      job.timer.unref?.();
      try {
        slot.worker.postMessage({ id: job.id, type: job.type, state: job.state, args: job.args });
      }
      catch(err) {
        this.#kill(slot, err.message);
      }
    }
  }

  #spawn() {
    const slot = { worker: null, busy: false, job: null, idleTimer: null };
    try {
      slot.worker = new Worker(WORKER_URL);
    }
    catch(err) {
      // No worker support (should not happen on Node 24): callers fall back inline
      return null;
    }
    slot.worker.unref();
    slot.worker.on('message', ({ id, result, error }) => {
      const job = slot.job;
      if(!job || job.id !== id) { return; }
      clearTimeout(job.timer);
      slot.busy = false;
      slot.job = null;
      if(error) { job.resolve(Promise.reject(new Error(error))); }
      else { job.resolve(result); }
      this.#idleWatch(slot);
      this.#pump();
    });
    slot.worker.on('error', (err) => this.#kill(slot, err.message));
    this.workers.push(slot);
    return slot;
  }

  #kill(slot, reason) {
    const job = slot.job;
    slot.job = null;
    slot.busy = false;
    clearTimeout(slot.idleTimer);
    this.workers = this.workers.filter((s) => s !== slot);
    slot.worker.terminate().catch(() => {});
    if(job) {
      clearTimeout(job.timer);
      job.resolve(Promise.reject(new Error(reason))); // caller falls back inline
    }
    this.#pump();
  }

  // Idle workers cost ~40 MB each; let them go when nothing is happening
  #idleWatch(slot) {
    clearTimeout(slot.idleTimer);
    slot.idleTimer = setTimeout(() => {
      if(!slot.busy) {
        this.workers = this.workers.filter((s) => s !== slot);
        slot.worker.terminate().catch(() => {});
      }
    }, this.idleMs);
    slot.idleTimer.unref?.();
  }

  async destroy() {
    this.destroyed = true;
    for(const job of this.queue.splice(0)) {
      clearTimeout(job.timer);
      job.resolve(Promise.reject(new Error('pool destroyed')));
    }
    await Promise.all(this.workers.splice(0).map((s) => {
      clearTimeout(s.idleTimer);
      return s.worker.terminate().catch(() => {});
    }));
  }
}

// Shared pool for the server process
export const pool = new AnalysisPool();
