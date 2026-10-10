# open5dchess MCP server

Lets an LLM agent (Claude Code, Claude Desktop, or any MCP client) play 5D chess
on an open5dchess server. You paste an invite link into the chat and keep talking
about the game while the model plays.

It is a thin client over the server's text endpoints and has no game logic of its
own: the server validates every move and lists the legal ones.

## Setup (Claude Code)

```sh
cd mcp && npm ci
claude mcp add --scope user open5dchess -e OPEN5DCHESS_URL=http://localhost:8090 -- node /path/to/open5dchess/mcp/src/index.js
```

`OPEN5DCHESS_URL` is only used by `create_game`. `join_game` takes the server
address from the link itself.

## Playing

1. Open the site, choose **Online Play**, create a game, and copy the invite link
   for the other colour.
2. In the chat: *"Let's play 5D chess, here's your link: http://localhost:3000/#/g/…?seat=…"*
3. The model joins, waits for your moves (`wait_for_turn` returns at least every
   ~45 s, so you can keep chatting) and plays its own.

Or ask the model to start a game: it calls `create_game` and gives you a link.

## Tools

| Tool | What it does |
|---|---|
| `join_game(link)` | Take the seat the link belongs to; returns the rules primer and the position |
| `get_rules()` | The rules primer again (5D concepts, notation, beginner mistakes) |
| `create_game(color, variant, time_control?)` | New game; returns the link for the other seat |
| `get_state(include_pgn?, view?, full?)` | Board overview + full grids for new/changed/current boards only (boards already shown earlier stay valid; `full=true` reprints everything), whose turn, check, clocks, threats, legal moves |
| `get_board(timeline, turn)` | Re-print one specific board by name, e.g. `("1", "14b")` |
| `preview_moves(moves[])` | What the opponent could do after these moves (captures, checks, mate threats); nothing is played |
| `list_legal_moves()` | Moves that can be part of a legal turn |
| `make_moves(moves[], submit=true)` | Play moves (all-or-nothing) and submit the turn |
| `undo_staged_move()` | Take back a staged (unsubmitted) move |
| `wait_for_turn(timeout_seconds)` | Long-poll until it's your turn or the game ends |
| `resign()` | Resign |

## What the model sees

- **Rules primer** on joining: boards, timelines, time travel, the present,
  check, notation, and the classic beginner mistake (forgetting that past
  boards can be attacked).
- **All boards**: one row per timeline, one column per moment in time, so
  simultaneous boards line up. `*` marks boards it can move on.
- **Threats** on its turn: what the opponent could do if it made no move:
  captures, checks and mate threats, including through time.
  `preview_moves` gives the same for a candidate move.
- **Legal moves**: only moves that can be part of a legal turn.

## Without MCP

The invite dialog also shows a link "For an AI opponent":
`/api/games/<id>/llm?seat=<token>`, a plain-text page with the rules, the state
and the HTTP calls below. `join_game` accepts that link too.

```
GET  /api/rules                                 the rules primer (text)
GET  /api/games/<id>/llm?seat=<token>           rules + state + API as one text page
GET  /api/games/<id>/state?seat=<token>         JSON: boards, timelines, threats, pgn, toMove, legalMoves, ...
POST /api/games/<id>/preview?seat=<token>       {"moves": ["Nxd5"]} -> threats after these moves
POST /api/games/<id>/moves?seat=<token>         {"moves": ["e4"], "submit": true}
POST /api/games/<id>/undo?seat=<token>
POST /api/games/<id>/resign?seat=<token>
GET  /api/games/<id>/wait?seat=<token>&timeout=45000
```

## A note on strength

LLMs play 5D chess weakly. The legal move list stops illegal moves, not bad
ones. Expect a fun opponent, not a strong one.
