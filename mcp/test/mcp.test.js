import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createApp } from '../../server/src/app.js';
import { GameClient, parseLink, createGame, formatState } from '../src/gameClient.js';

let app;
let base;
before(async () => {
  app = createApp({});
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(() => {
  app.server.closeAllConnections();
  app.server.close();
});

test('parseLink understands invite links and rejects others', () => {
  assert.deepEqual(parseLink('http://localhost:3000/#/g/abc_-1?seat=TOKEN'), { baseUrl: 'http://localhost:3000', gameId: 'abc_-1', seat: 'TOKEN' });
  assert.deepEqual(parseLink('https://chess.example/sub/#/g/x?seat=t').baseUrl, 'https://chess.example/sub');
  assert.throws(() => parseLink('not a url'), /valid URL/);
  assert.throws(() => parseLink('http://x/#/play'), /invite link/);
  assert.throws(() => parseLink('http://x/#/g/abc'), /invite link|seat/);
});

test('game client plays, waits and reports errors with legal moves', async () => {
  const created = await createGame(base, { creatorColor: 'white' });
  const white = GameClient.fromLink(created.links.white);
  const black = GameClient.fromLink(created.links.black);
  let s = await white.state();
  assert.equal(s.yourTurn, true);
  await assert.rejects(white.moves(['Ke2']), (err) => err.status === 400 && err.legalMoves.length === 20);
  const waiting = black.waitForTurn(5);
  await white.moves(['e4']);
  s = await waiting;
  assert.equal(s.yourTurn, true);
  const text = formatState(s);
  assert.match(text, /YOUR TURN \(black\)/);
  assert.match(text, /Legal moves \(20\)/);
});

test('MCP over stdio: join by link, play, wait, see the result', async () => {
  const created = await createGame(base, { creatorColor: 'white' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(import.meta.dirname, '../src/index.js')],
    env: Object.assign({}, process.env, { OPEN5DCHESS_URL: base }),
  });
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
  try {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(tools, ['create_game', 'get_state', 'join_game', 'list_legal_moves', 'make_moves', 'resign', 'undo_staged_move', 'wait_for_turn']);

    const call = async (name, args = {}) => {
      const res = await client.callTool({ name, arguments: args });
      return { text: res.content[0].text, isError: res.isError === true };
    };

    // Before joining
    assert.equal((await call('get_state')).isError, true);

    // The model plays Black via the link the "user" pasted
    let r = await call('join_game', { link: created.links.black });
    assert.match(r.text, /you are black/);
    assert.match(r.text, /Waiting: white to move/);

    const white = GameClient.fromLink(created.links.white);
    const waiting = call('wait_for_turn', { timeout_seconds: 10 });
    await white.moves(['f3']);
    r = await waiting;
    assert.match(r.text, /YOUR TURN \(black\)/);

    r = await call('make_moves', { moves: ['Ke7', 'e5'] });
    assert.equal(r.isError, true);
    assert.match(r.text, /Illegal move: Ke7/);
    assert.match(r.text, /Legal moves: /);

    r = await call('make_moves', { moves: ['e5'] });
    assert.equal(r.isError, false);
    assert.match(r.text, /Played and submitted: e5/);

    await white.moves(['g4']);
    r = await call('list_legal_moves');
    assert.match(r.text, /Qh4/);
    r = await call('make_moves', { moves: ['Qh4'] });
    assert.match(r.text, /Played and submitted: Qh4/);

    r = await call('resign');
    assert.match(r.text, /GAME OVER: white wins by resignation \(you lost\)/);
  }
  finally {
    await client.close();
  }
});

test('MCP create_game gives the user a link for the other seat', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve(import.meta.dirname, '../src/index.js')],
    env: Object.assign({}, process.env, { OPEN5DCHESS_URL: base }),
  });
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
  try {
    const res = await client.callTool({ name: 'create_game', arguments: { color: 'black' } });
    const t = res.content[0].text;
    assert.match(t, /You play black/);
    const link = t.match(/play white: (\S+)/)[1];
    const user = GameClient.fromLink(link);
    assert.equal((await user.state()).you, 'white');
  }
  finally {
    await client.close();
  }
});
