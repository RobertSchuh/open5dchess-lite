// In-memory game store with limits and expiry. Nothing is persisted:
// a server restart drops all games, which is accepted.
import { randomBytes } from 'node:crypto';
import { Game, GameError } from './game.js';

export class GameStore {
  constructor({
    maxGames = 50,
    endedTtlMs = 60 * 60 * 1000,       // delete 1 h after a game ends
    idleTtlMs = 24 * 60 * 60 * 1000,   // or after 24 h without activity
    now = Date.now,
  } = {}) {
    this.games = new Map();
    this.maxGames = maxGames;
    this.endedTtlMs = endedTtlMs;
    this.idleTtlMs = idleTtlMs;
    this.now = now;
  }

  create(options) {
    this.sweep();
    if(this.games.size >= this.maxGames) {
      throw new GameError(503, 'Too many games right now, try again later');
    }
    let id;
    do { id = randomBytes(6).toString('base64url'); } while(this.games.has(id));
    const game = new Game(Object.assign({}, options, { id, now: this.now }));
    this.games.set(id, game);
    return game;
  }

  get(id) {
    const game = this.games.get(id);
    if(!game) { throw new GameError(404, 'Game not found (it may have expired)'); }
    return game;
  }

  // Remove expired games; listeners (sockets, waiters) are told via onRemove
  sweep() {
    const now = this.now();
    for(const [id, game] of this.games) {
      const expired = (game.endedAt !== null && now - game.endedAt > this.endedTtlMs) ||
        now - game.lastActivity > this.idleTtlMs;
      if(expired) {
        this.games.delete(id);
        clearTimeout(game.flagTimer);
        game.removed = true;
        for(const fn of [...game.listeners]) {
          try { fn(game); } catch(err) { console.error(err); }
        }
        game.listeners.clear();
      }
    }
  }
}
