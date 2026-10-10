import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameStore } from '../src/store.js';
import { RateLimiter } from '../src/ratelimit.js';

test('store caps concurrent games', () => {
  const store = new GameStore({ maxGames: 2 });
  store.create({});
  store.create({});
  assert.throws(() => store.create({}), (err) => err.status === 503);
});

test('unknown game is a 404', () => {
  const store = new GameStore();
  assert.throws(() => store.get('nope'), (err) => err.status === 404);
});

test('ended games expire after 1 h, idle games after 24 h', () => {
  let now = 0;
  const store = new GameStore({ now: () => now });
  const ended = store.create({});
  const idle = store.create({});
  const active = store.create({});
  ended.resign('white');
  let notified = false;
  idle.onChange(() => { notified = idle.removed === true; });

  now = 60 * 60 * 1000 + 1;
  active.move('white', 'e4'); // activity keeps it alive
  store.sweep();
  assert.equal(store.games.has(ended.id), false);
  assert.equal(store.games.has(idle.id), true);

  now = 24 * 60 * 60 * 1000 + 2;
  store.sweep();
  assert.equal(store.games.has(idle.id), false);
  assert.equal(notified, true);
  assert.equal(store.games.has(active.id), true);
});

test('rate limiter allows a burst then refills over time', () => {
  let now = 0;
  const rl = new RateLimiter({ rate: 2, perMs: 1000, burst: 3, now: () => now });
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('a'), false);
  assert.equal(rl.allow('b'), true); // separate key
  now = 500; // +1 token
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('a'), false);
});
