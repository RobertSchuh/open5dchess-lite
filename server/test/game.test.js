import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, GameError } from '../src/game.js';

const play = (game, seat, moves) => {
  for(const m of moves) { game.move(seat, m); }
  game.submit(seat);
};

test('seat tokens are 128-bit, distinct, and map to seats', () => {
  const g = new Game({ id: 'x' });
  const tokens = [g.seats.white.token, g.seats.black.token, g.spectateToken];
  assert.equal(new Set(tokens).size, 3);
  for(const t of tokens) { assert.equal(Buffer.from(t, 'base64url').length, 16); }
  assert.equal(g.seatFor(g.seats.white.token), 'white');
  assert.equal(g.seatFor(g.seats.black.token), 'black');
  assert.equal(g.seatFor(g.spectateToken), 'spectator');
  assert.equal(g.seatFor('nope'), null);
  assert.equal(g.seatFor(undefined), null);
  assert.equal(g.seatFor(g.seats.white.token.slice(0, -1) + 'A'), g.seats.white.token.endsWith('A') ? 'white' : null);
});

test('unknown variant and bad time control are rejected', () => {
  assert.throws(() => new Game({ id: 'x', variant: 'nonsense' }), GameError);
  assert.throws(() => new Game({ id: 'x', timeControl: 'garbage' }), GameError);
});

test('turn order, illegal moves and spectators are enforced', () => {
  const g = new Game({ id: 'x' });
  assert.throws(() => g.move('black', 'e5'), /Not your turn/);
  assert.throws(() => g.move('spectator', 'e4'), /Spectators/);
  assert.throws(() => g.move('white', 'Ke2'), /Illegal move/);
  assert.throws(() => g.submit('white'), /present board/);
  g.move('white', 'e4');
  assert.throws(() => g.move('white', 'd4'), /Illegal move/); // board already moved on
  g.undo('white');
  assert.equal(g.chess.moveBuffer.length, 0);
  play(g, 'white', ['e4']);
  assert.equal(g.player, 'black');
});

test("fool's mate is not mate in 5D: the king escapes back in time", async () => {
  const g = new Game({ id: 'x' });
  play(g, 'white', ['f3']);
  play(g, 'black', ['e5']);
  play(g, 'white', ['g4']);
  play(g, 'black', ['Qh4']);
  assert.equal(g.result, null);
  assert.ok((await g.legalMoves()).some((m) => m.includes('>>')));
});

test('checkmate across timelines ends the game', () => {
  // Robert's test game (Turn Zero): mate after a time-travel queen capture
  const g = new Game({ id: 'x', variant: 'turn_zero' });
  const actions = ['e3', 'e6', 'Qf3', 'Nc6', 'Na3', 'Nb4', 'Nb5', 'Nxa2', 'Rxa2', 'a6', 'Nxc7', 'Qxc7',
    '(0T7)Qf3>>x(0T3)f7~', '(0T7)Qc7>>x(0T2)c2~', '(-1T3)Qxf7'];
  actions.forEach((m, i) => play(g, i % 2 === 0 ? 'white' : 'black', [m]));
  assert.deepEqual(g.result, { winner: 'white', reason: 'checkmate' });
  assert.throws(() => g.move('black', 'a5'), /Game is over/);
});

test('cannot submit while in check', () => {
  const g = new Game({ id: 'x' });
  play(g, 'white', ['e4']);
  play(g, 'black', ['f6']);
  play(g, 'white', ['Qh5']);
  // Black is in check; a pawn move elsewhere is a legal move but leaves check
  g.move('black', 'a6');
  assert.throws(() => g.submit('black'), /check/);
  g.undo('black');
  play(g, 'black', ['g6']);
  assert.equal(g.result, null);
});

test('legal move list only contains moves that can complete an action', async () => {
  const g = new Game({ id: 'x' });
  play(g, 'white', ['e4']);
  play(g, 'black', ['f6']);
  play(g, 'white', ['Qh5']);
  const legal = await g.legalMoves();
  assert.deepEqual([...legal].sort(), ['g6']);
});

test('resign ends the game for the other side', () => {
  const g = new Game({ id: 'x' });
  g.resign('black');
  assert.deepEqual(g.result, { winner: 'white', reason: 'resignation' });
  assert.throws(() => g.resign('white'), /over/);
});

test('clock flags the player whose time runs out', () => {
  let now = 1000000;
  const g = new Game({ id: 'x', timeControl: '1', now: () => now });
  // 5d-chess-clock reads Date.now() itself, so drive its state directly
  play(g, 'white', ['e4']);
  assert.equal(g.clock.state().running, true);
  g.clock.state({ blackDurationLeft: 0, blackDelayLeft: 0 });
  g.updateClock();
  assert.deepEqual(g.result, { winner: 'white', reason: 'time' });
});

test('version increases on every change and listeners are called', () => {
  const g = new Game({ id: 'x' });
  let calls = 0;
  const off = g.onChange(() => calls++);
  const v = g.version;
  g.move('white', 'e4');
  g.submit('white');
  assert.equal(g.version, v + 2);
  assert.equal(calls, 2);
  off();
  g.move('black', 'e5');
  assert.equal(calls, 2);
});

test('text state shows boards, staged moves and legal moves only on your turn', async () => {
  const g = new Game({ id: 'x' });
  g.move('white', 'e4');
  const w = await g.textState('white');
  assert.deepEqual(w.staged, ['e4']);
  assert.equal(w.submittable, true);
  assert.match(w.boards, /4 \. \. \. \. P/); // staged e4 is on the board
  const b = await g.textState('black');
  assert.deepEqual(b.legalMoves, []);
  assert.equal(b.yourTurn, false);
});

test('in check on one board: only moves that can still lift the check there are listed for it', async () => {
  // Robert's game: White's king on L-2 is attacked by a queen that time-travelled in
  const g = new Game({ id: 'x' });
  const actions = ['e3', 'e6', 'Qf3', 'Nc6', 'Na3', 'Nb4', 'Nb5', 'Nxc2', 'Kd1', 'Nxa1', 'Nxc7', 'Qxc7',
    '(0T7)Qf3>>x(0T3)f7~', '(0T7)Qc7>>x(0T2)c2~', '(-1T3)Bd3', '(-1T3)Qc2>>(0T2)d1~'];
  actions.forEach((m, i) => play(g, i % 2 === 0 ? 'white' : 'black', [m]));
  const legal = await g.legalMoves();
  const onCheckedBoard = legal.filter((m) => m.startsWith('(-2T3)'));
  assert.ok(onCheckedBoard.includes('(-2T3)Kxd1'));
  assert.ok(onCheckedBoard.includes('(-2T3)Qxd1'));
  assert.ok(!onCheckedBoard.includes('(-2T3)Nc3'));
  assert.ok(onCheckedBoard.length <= 3, onCheckedBoard.join(' '));
  // Moves on other boards stay legal: they can be combined with Kxd1
  assert.ok(legal.includes('(0T8)a3'));
});
