#!/usr/bin/env node
// MCP server (stdio) that lets an LLM take a seat in an open5dchess game.
// Paste an invite link into the chat; the model calls join_game with it.
// Optional env: OPEN5DCHESS_URL (server for create_game, default http://localhost:8090)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { GameClient, createGame, formatState } from './gameClient.js';

const DEFAULT_SERVER = process.env.OPEN5DCHESS_URL || 'http://localhost:8090';

const NOTATION = `5D chess notation (5DPGN), as used by all tools:
- Single timeline: plain chess notation: e4, Nf3, exd5, O-O, e8=Q.
- Once there are several timelines, moves are prefixed with the board they start on: (L T) = timeline, turn.
  Example: (0T5)Nf3 is a knight move on timeline 0, turn 5.
- Moves to another board: ">" jumps to a board in another timeline, ">>" travels to the past and creates a new
  timeline, "x" marks a capture, "~" marks a new timeline, "(>L1)" says which timeline it created.
  Example: (0T7)Qf3>>x(0T3)f7~ is a queen travelling from timeline 0 turn 7 back to turn 3, capturing on f7.
- A turn ("action") can need several moves: one on every present board where it is your move.
  Your king must not be in check on any board when you submit.
Always copy moves exactly from the legal move list; it only contains moves that can complete a legal turn.`;

let game = null; // current GameClient
let seenVersion = null; // last stateVersion whose boards we fetched in full
const cursor = () => seenVersion;
const sawState = (s) => { if(typeof s.stateVersion === 'number') { seenVersion = s.stateVersion; } return s; };

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (t) => ({ content: [{ type: 'text', text: t }], isError: true });
const needGame = () => {
  if(!game) { throw new Error('No game joined yet. Ask the user for an invite link and call join_game, or call create_game.'); }
  return game;
};
const run = (fn) => async (args) => {
  try { return await fn(args || {}); }
  catch(err) {
    let msg = `Error: ${err.message}`;
    if(err.legalMoves) { msg += `\nLegal moves: ${err.legalMoves.join(', ')}`; }
    return fail(msg);
  }
};

const server = new McpServer({ name: 'open5dchess', version: '0.2.0' }, {
  instructions: 'Play 5D chess (with multiverse time travel) against people. When the user pastes an open5dchess ' +
    'invite link (http://host/#/g/<id>?seat=<token>), call join_game with it: it returns the rules and the position. ' +
    'Each turn: read THREATS, use preview_moves on candidates, then make_moves with moves from the legal list. ' +
    'Use wait_for_turn while the opponent thinks, and keep chatting with the user about the game.',
});

server.registerTool('join_game', {
  title: 'Join a 5D chess game',
  description: 'Take a seat in an open5dchess game using an invite link the user pasted ' +
    '(looks like http://host/#/g/<id>?seat=<token>). The link decides your colour. Returns the current position.\n\n' + NOTATION,
  inputSchema: { link: z.string().describe('The invite link') },
}, run(async ({ link }) => {
  const client = GameClient.fromLink(link);
  seenVersion = null;
  const s = sawState(await client.state());
  game = client;
  const rules = await client.rules().catch(() => NOTATION);
  return text(`${rules}\n\n=== JOINED ===\n${formatState(s)}`);
}));

server.registerTool('get_rules', {
  title: '5D chess rules',
  description: 'The rules primer: boards, timelines, time travel, the present, check, notation, and common beginner mistakes.',
}, run(async () => {
  if(game) { return text(await game.rules()); }
  return text(NOTATION);
}));

server.registerTool('preview_moves', {
  title: 'Preview moves (nothing is played)',
  description: 'Before committing: what could the opponent do if you played these moves? Lists their captures, checks ' +
    'and MATE threats after your moves, including time-travel attacks. Use this on candidate moves, especially when ' +
    'moving a piece that defends something.',
  inputSchema: { moves: z.array(z.string()).min(1).describe('Candidate moves, e.g. ["Nxd5"]') },
}, run(async ({ moves }) => {
  const p = await needGame().preview(moves);
  return text(`If you play ${moves.join(' ')}: ${p.note}\n${p.threatsText}`);
}));

server.registerTool('create_game', {
  title: 'Create a new 5D chess game',
  description: 'Start a new game on the server and take one seat yourself. Give the returned opponent link to the user ' +
    'so they can open it in their browser. Variants: standard, defended_pawn, half_reflected, princess, turn_zero, ' +
    'two_timelines, reversed_royalty. Time controls (optional, minutes): e.g. "10", "10;delp5"; omit for no clock.',
  inputSchema: {
    color: z.enum(['white', 'black', 'random']).default('black').describe('The colour YOU (the model) play'),
    variant: z.string().default('standard'),
    time_control: z.string().optional(),
    server_url: z.string().optional().describe(`Game server base URL (default ${DEFAULT_SERVER})`),
  },
}, run(async ({ color, variant, time_control, server_url }) => {
  const base = server_url || DEFAULT_SERVER;
  const res = await createGame(base, { creatorColor: color, variant, timeControl: time_control || null, nickname: 'Claude' });
  const opponent = res.seat === 'white' ? 'black' : 'white';
  seenVersion = null;
  game = GameClient.fromLink(res.links[res.seat]);
  return text(`Game created. You play ${res.seat}.\n` +
    `Give the user this link to play ${opponent}: ${res.links[opponent]}\n` +
    `Spectator link: ${res.links.spectate}\n` +
    (res.seat === 'white' ? 'You move first: call get_state, then make_moves.' : 'White moves first: call wait_for_turn.'));
}));

server.registerTool('get_state', {
  title: 'Get the game state',
  description: 'Current position: every board of every timeline (or just the latest ones), whose turn, check, ' +
    'clocks and, on your turn, the THREATS (what the opponent could do next, incl. mate threats) and legal moves.',
  inputSchema: {
    include_pgn: z.boolean().default(false).describe('Also return the whole game in 5DPGN'),
    view: z.enum(['all', 'latest']).default('all').describe('all = every board of every timeline; latest = only the latest board per timeline'),
    full: z.boolean().default(false).describe('true = print every board again even if already shown earlier in this conversation (use after losing track)'),
  },
}, run(async ({ include_pgn, view, full }) => {
  const s = sawState(await needGame().state(full ? null : cursor()));
  return text(formatState(s, { includePgn: include_pgn, view }));
}));

server.registerTool('get_board', {
  title: 'Fetch one specific board',
  description: 'Re-print a single board by name when you are unsure what it looked like, e.g. timeline 0, turn "14b" ' +
    '(the names shown in the board overview). Boards never change once their turn is over, so an earlier print is ' +
    'still valid - fetch only when in doubt.',
  inputSchema: {
    timeline: z.string().describe('Timeline number, e.g. "0", "1", "-1"'),
    turn: z.string().describe('Turn plus side, e.g. "14w" or "14b"'),
  },
}, run(async ({ timeline, turn }) => {
  const b = await needGame().board(timeline, turn);
  return text(b.board);
}));

server.registerTool('list_legal_moves', {
  title: 'List legal moves',
  description: 'Moves you can make now. Each can be part of a legal turn; if a turn needs several moves ' +
    '(several present boards), make one, then list again to see the follow-ups.',
}, run(async () => {
  const s = await needGame().state();
  if(s.result) { return text(formatState(s, { includeBoards: false })); }
  if(!s.yourTurn) { return text(`Not your turn (${s.toMove} to move). Call wait_for_turn.`); }
  return text(`Legal moves (${s.legalMoves.length}):\n${s.legalMoves.join('\n')}`);
}));

server.registerTool('make_moves', {
  title: 'Make moves and submit',
  description: 'Play one or more moves (5DPGN, copied from the legal move list). By default they are submitted as your ' +
    'turn. All moves are checked together: if one is illegal or the turn is incomplete, nothing is played and you get ' +
    'the reason plus the legal moves. Use submit=false to stage moves and look at the result first.\n\n' + NOTATION,
  inputSchema: {
    moves: z.array(z.string()).min(1).describe('Moves in order, e.g. ["e4"] or ["(0T5)Nf3", "(1T5)e5"]'),
    submit: z.boolean().default(true),
  },
}, run(async ({ moves, submit }) => {
  const s = sawState(await needGame().moves(moves, submit, cursor()));
  const done = submit ? `Played and submitted: ${moves.join(' ')}` : `Staged (not submitted): ${moves.join(' ')}`;
  return text(`${done}\n${formatState(s, { includeMoves: !submit })}`);
}));

server.registerTool('undo_staged_move', {
  title: 'Undo a staged move',
  description: 'Take back the last move staged with make_moves(submit=false). Submitted turns cannot be undone.',
}, run(async () => {
  const s = sawState(await needGame().undo(cursor()));
  return text(formatState(s));
}));

server.registerTool('wait_for_turn', {
  title: 'Wait for your turn',
  description: 'Wait until the opponent has moved (or the game ended). Returns after at most timeout_seconds even ' +
    'if they have not moved yet; then you can chat with the user and call it again.',
  inputSchema: { timeout_seconds: z.number().int().min(1).max(55).default(45) },
}, run(async ({ timeout_seconds }) => {
  const s = sawState(await needGame().waitForTurn(timeout_seconds, cursor()));
  if(s.timeout && !s.yourTurn && !s.result) {
    return text(`Still waiting: ${s.toMove} has not moved yet (waited ${timeout_seconds}s). Call wait_for_turn again when ready.`);
  }
  return text(formatState(s));
}));

server.registerTool('resign', {
  title: 'Resign',
  description: 'Resign the current game. Only do this if the user asks or the position is hopeless.',
}, run(async () => {
  const s = await needGame().resign();
  return text(formatState(s, { includeBoards: false }));
}));

await server.connect(new StdioServerTransport());
