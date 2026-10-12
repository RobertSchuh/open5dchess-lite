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
  const games = loadGames();
  games[body.gameId] = {
    links: body.links, seat: body.seat, myLink: body.links[body.seat],
    variant, createdAt: Date.now(), lastSeen: Date.now(), endedAt: null,
  };
  saveGames(games);
  return body;
};

//Expiry mirrors the server's retention (store.js): a game is deleted there
//1 h after it ends or 24 h after the last activity, so links older than
//that are dead and dropped here too.
const ENDED_TTL_MS = 60 * 60 * 1000;
const IDLE_TTL_MS = 24 * 60 * 60 * 1000;

const loadGames = () => {
  const games = store.get('onlineGames') || {};
  const now = Date.now();
  for(const id of Object.keys(games)) {
    const g = games[id];
    const lastSeen = g.lastSeen || g.createdAt || 0;
    if((g.endedAt && now - g.endedAt > ENDED_TTL_MS) || now - lastSeen > IDLE_TTL_MS) {
      delete games[id];
    }
  }
  return games;
};
const saveGames = (games) => {
  //Keep only the 20 most recently seen
  const ids = Object.keys(games).sort((a, b) => (games[b].lastSeen || 0) - (games[a].lastSeen || 0));
  for(const id of ids.slice(20)) { delete games[id]; }
  store.set('onlineGames', games);
};

//Remember/refresh a game on this device; called by the game page, so games
//joined via someone else's invite link are reopenable too.
export const touchGame = (gameId, { link, seat, variant, ended } = {}) => {
  const games = loadGames();
  const g = games[gameId] || { createdAt: Date.now() };
  if(link) { g.myLink = link; }
  if(seat) { g.seat = seat; }
  if(variant) { g.variant = variant; }
  if(ended && !g.endedAt) { g.endedAt = Date.now(); }
  if(!ended) { g.endedAt = null; } //rematch revives the same id
  g.lastSeen = Date.now();
  games[gameId] = g;
  saveGames(games);
};

//The game no longer exists on the server
export const forgetGame = (gameId) => {
  const games = store.get('onlineGames') || {};
  delete games[gameId];
  store.set('onlineGames', games);
};

//Online games this device can reopen, newest first
export const listGames = () => {
  const games = loadGames();
  store.set('onlineGames', games);
  return Object.entries(games)
    .map(([gameId, g]) => ({
      gameId,
      myLink: g.myLink || (g.links && g.seat ? g.links[g.seat] : null),
      seat: g.seat, variant: g.variant,
      endedAt: g.endedAt || null, lastSeen: g.lastSeen || g.createdAt,
    }))
    .filter((g) => g.myLink)
    .sort((a, b) => b.lastSeen - a.lastSeen);
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
