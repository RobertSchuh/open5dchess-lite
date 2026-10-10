// One plain-text page with everything an LLM agent needs to play: the rules,
// the current state, and how to send moves over HTTP. Served at
// GET /api/games/<id>/llm?seat=<token>.
import { RULES } from './describe.js';

const RESULT_TEXT = { checkmate: 'by checkmate', stalemate: 'by stalemate', time: 'on time', resignation: 'by resignation' };

export const stateText = (s) => {
  const lines = [];
  const name = (c) => s.players[c].nickname || (c === 'white' ? 'White' : 'Black');
  lines.push(`Game ${s.id}, variant ${s.variant}. You are ${s.you}.`);
  lines.push(`White: ${name('white')}${s.players.white.connected ? '' : ' (not connected)'}; Black: ${name('black')}${s.players.black.connected ? '' : ' (not connected)'}`);
  if(s.result) {
    const r = s.result;
    lines.push(r.winner === 'draw' ? `GAME OVER: draw ${RESULT_TEXT[r.reason] || r.reason}.` : `GAME OVER: ${r.winner} wins ${RESULT_TEXT[r.reason] || r.reason}.`);
  }
  else {
    lines.push(s.yourTurn ? `IT IS YOUR TURN (${s.toMove}).${s.inCheck ? ' You are in check.' : ''}` : `Waiting for ${s.toMove} to move.`);
  }
  if(s.clock) { lines.push(`Clock (seconds left): white ${s.clock.white}, black ${s.clock.black}`); }
  if(s.staged.length) { lines.push(`Staged this turn, not submitted: ${s.staged.join(' ')}${s.submittable ? ' (can submit)' : ''}`); }
  lines.push('', 'ALL BOARDS', s.timelines);
  if(s.yourTurn) {
    lines.push('', 'THREATS', s.threatsText);
    lines.push('', `LEGAL MOVES (${s.legalMoves.length})`, s.legalMoves.join(', '));
  }
  lines.push('', 'GAME SO FAR (5DPGN)', s.pgn.trim());
  return lines.join('\n');
};

export const llmPage = (game, seat, baseUrl, token) => {
  const s = game.textState(seat);
  const api = `${baseUrl}/api/games/${game.id}`;
  const q = `seat=${token}`;
  return `${RULES}

HOW TO PLAY OVER HTTP (seat token included in every URL)
- This page (rules + state):  GET  ${api}/llm?${q}
- State as JSON:              GET  ${api}/state?${q}
- Wait for your turn:         GET  ${api}/wait?${q}&timeout=45000   (returns when it's your turn or after 45 s)
- Check a move first:         POST ${api}/preview?${q}   body {"moves": ["e4"]}   -> what the opponent could do after it
- Play and submit:            POST ${api}/moves?${q}     body {"moves": ["e4"], "submit": true}
- Resign:                     POST ${api}/resign?${q}
A rejected move returns an error and the list of legal moves; nothing is played.

CURRENT STATE
${stateText(s)}
`;
};
