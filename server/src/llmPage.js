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
  else if(s.yourTurn) {
    lines.push(`IT IS YOUR TURN (${s.toMove}).${s.inCheck ? ' You are in check:' : ''}`);
    for(const c of s.checks || []) { lines.push(`  CHECK: ${c}`); }
  }
  else {
    const seen = s.players[s.toMove].lastSeenSecondsAgo;
    lines.push(`Waiting for ${s.toMove} to move${seen === null ? '' : ` (opponent last seen ${seen}s ago)`}.`);
  }
  if(s.clock) { lines.push(`Clock (seconds left): white ${s.clock.white}, black ${s.clock.black}`); }
  if(s.staged.length) { lines.push(`Staged this turn, not submitted: ${s.staged.join(' ')}${s.submittable ? ' (can submit)' : ''}`); }
  lines.push('', 'ALL BOARDS', s.timelines);
  if(s.yourTurn) {
    lines.push('', 'THREATS', s.threatsText);
    const note = s.legalMovesUnverified > 0
      ? ` - WARNING: the legality search timed out; ${s.legalMovesUnverified} of these are unproven and may turn out to have no legal continuation`
      : '';
    lines.push('', `LEGAL MOVES (${s.legalMoves.length})${note}`, s.legalMoves.join(', '));
  }
  lines.push('', 'GAME SO FAR (5DPGN)', s.pgn.trim());
  return lines.join('\n');
};

export const llmPage = async (game, seat, baseUrl, token) => {
  const s = await game.textState(seat);
  const api = `${baseUrl}/api/games/${game.id}`;
  const q = `seat=${token}`;
  return `${RULES}

HOW TO PLAY OVER HTTP (seat token included in every URL)
- This page (rules + state):  GET  ${api}/llm?${q}
- State as JSON:              GET  ${api}/state?${q}
  Add &since=<stateVersion from an earlier response> and the board text becomes a delta:
  an overview of all board names plus full grids only for new/changed/current boards.
  Boards never change once their turn is over, so earlier prints stay valid.
- One specific board:         GET  ${api}/board?${q}&l=<timeline>&t=<turn+side>   e.g. l=0&t=14b
- Wait for your turn:         GET  ${api}/wait?${q}&timeout=45000   (returns when it's your turn or after 45 s; also accepts &since=)
- Check a move first:         POST ${api}/preview?${q}   body {"moves": ["e4"]}   -> what the opponent could do after it
- Play and submit:            POST ${api}/moves?${q}     body {"moves": ["e4"], "submit": true}
  To stage without submitting: "submit": false in the body, or &submit=false in the URL (both work).
  Can you only fetch URLs (no POST)? Use GET instead:
                              GET  ${api}/moves?${q}&moves=e4
  Several moves in one turn: separate with commas, e.g. &moves=(0T5)Nf3,(1T5)e5
  (URL-encode if your tool requires it; add &submit=false to stage without submitting.)
  If your tool hides the body of 4xx responses, also add &soft=1: errors then
  come back with status 200 as {"ok":false,"error":...,"legalMoves":[...]}.
- Undo a staged move:         POST ${api}/undo?${q}      (pops the last staged, unsubmitted move)
- Resign:                     POST ${api}/resign?${q}
- Rematch (after game over):  POST ${api}/rematch?${q}   -> same game id and links, colors swapped, fresh board
A rejected move returns an error and the list of legal moves; nothing is played.

CURRENT STATE
${stateText(s)}
`;
};
