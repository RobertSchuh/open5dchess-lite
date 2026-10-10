//Talks to our own game server (same origin as the page, see server/).
import store from 'store';

//Create a game; returns { gameId, seat, links: { white, black, spectate } }
export const createGame = async ({ variant, timeControl, creatorColor, nickname }) => {
  const res = await fetch('api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variant, timeControl, creatorColor, nickname }),
  });
  const body = await res.json().catch(() => ({}));
  if(!res.ok) {
    throw new Error(body.error || `Server error (${res.status})`);
  }
  //Remember the links on this device so the invite can be shown again
  const games = store.get('onlineGames') || {};
  games[body.gameId] = { links: body.links, seat: body.seat, createdAt: Date.now() };
  //Keep only the 20 newest
  const ids = Object.keys(games).sort((a, b) => games[b].createdAt - games[a].createdAt);
  for(const id of ids.slice(20)) { delete games[id]; }
  store.set('onlineGames', games);
  return body;
};

//Invite links for a game created on this device (or null)
export const storedLinks = (gameId) => {
  const games = store.get('onlineGames') || {};
  return games[gameId] ? games[gameId].links : null;
};

export const socketUrl = (gameId, seat) => {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  //Relative to the page path, so it also works under a sub-path
  const basePath = window.location.pathname.replace(/[^/]*$/, '');
  return `${proto}://${window.location.host}${basePath}ws?game=${encodeURIComponent(gameId)}&seat=${encodeURIComponent(seat)}`;
};
