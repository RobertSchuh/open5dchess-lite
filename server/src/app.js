// HTTP API + WebSocket + static client, all on one port.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { GameStore } from './store.js';
import { GameError, VARIANTS } from './game.js';
import { RateLimiter } from './ratelimit.js';

const MAX_BODY = 16 * 1024;
const WAIT_DEFAULT_MS = 25000;
const WAIT_MAX_MS = 55000;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

const isLoopback = (addr) => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';

// Client IP. X-Forwarded-For is only trusted from localhost (Tailscale Funnel / proxy).
export const clientIp = (req) => {
  const addr = req.socket.remoteAddress || '';
  const fwd = req.headers['x-forwarded-for'];
  if(isLoopback(addr) && typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return addr;
};

const baseUrl = (req, publicUrl) => {
  if(publicUrl) { return publicUrl.replace(/\/+$/, ''); }
  let proto = 'http';
  const fwdProto = req.headers['x-forwarded-proto'];
  if(isLoopback(req.socket.remoteAddress || '') && typeof fwdProto === 'string') {
    proto = fwdProto.split(',')[0].trim();
  }
  return `${proto}://${req.headers.host || 'localhost'}`;
};

const gameLink = (base, id, token) => `${base}/#/g/${id}?seat=${token}`;

const sendJson = (res, status, body) => {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
};

const readJson = (req) => new Promise((resolve, reject) => {
  let size = 0;
  let tooLarge = false;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if(size > MAX_BODY) { tooLarge = true; chunks.length = 0; return; } // drain, answer at end
    chunks.push(c);
  });
  req.on('end', () => {
    if(tooLarge) { reject(new GameError(413, 'Request body too large')); return; }
    if(chunks.length === 0) { resolve({}); return; }
    try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch(err) { reject(new GameError(400, 'Body must be JSON')); }
  });
  req.on('error', reject);
});

export const createApp = ({
  staticDir = null,
  publicUrl = null,
  store = new GameStore(),
  createLimit = new RateLimiter({ rate: 10, perMs: 10 * 60 * 1000, burst: 5 }),
  apiLimit = new RateLimiter({ rate: 60, perMs: 10 * 1000 }),
  socketMessageLimit = () => new RateLimiter({ rate: 20, perMs: 1000, burst: 40 }),
  sweepIntervalMs = 60 * 1000,
} = {}) => {
  const staticRoot = staticDir ? path.resolve(staticDir) : null;

  // Resolve a seat token for a game, or throw 403
  const seatOf = (game, token) => {
    const seat = game.seatFor(token);
    if(!seat) { throw new GameError(403, 'Invalid or missing seat token'); }
    return seat;
  };

  const routes = async (req, res, url) => {
    const parts = url.pathname.split('/').filter(Boolean); // ['api', 'games', id, action]
    const ip = clientIp(req);

    if(parts.length === 2 && parts[1] === 'health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, games: store.games.size });
    }
    if(parts[1] !== 'games') { throw new GameError(404, 'Not found'); }

    // POST /api/games -> create a game and its invite links
    if(parts.length === 2 && req.method === 'POST') {
      if(!createLimit.allow(ip)) { throw new GameError(429, 'Too many new games, slow down'); }
      const body = await readJson(req);
      let color = body.creatorColor || 'white';
      if(color === 'random') { color = Math.random() < 0.5 ? 'white' : 'black'; }
      if(color !== 'white' && color !== 'black') { throw new GameError(400, 'creatorColor must be white, black or random'); }
      const game = store.create({ variant: body.variant || 'standard', timeControl: body.timeControl || null });
      if(body.nickname) { game.setNickname(color, body.nickname); }
      const base = baseUrl(req, publicUrl);
      return sendJson(res, 201, {
        gameId: game.id,
        seat: color,
        links: {
          white: gameLink(base, game.id, game.seats.white.token),
          black: gameLink(base, game.id, game.seats.black.token),
          spectate: gameLink(base, game.id, game.spectateToken),
        },
      });
    }

    if(!apiLimit.allow(ip)) { throw new GameError(429, 'Too many requests, slow down'); }
    if(parts.length !== 4) { throw new GameError(404, 'Not found'); }
    const game = store.get(parts[2]);
    const seat = seatOf(game, url.searchParams.get('seat'));
    const action = parts[3];

    if(action === 'state' && req.method === 'GET') {
      return sendJson(res, 200, game.textState(seat));
    }

    // Body: { moves: ["e4"], submit: true }. All moves of one request are
    // applied together; on any error they are rolled back.
    if(action === 'moves' && req.method === 'POST') {
      const body = await readJson(req);
      const moves = Array.isArray(body.moves) ? body.moves : (typeof body.moves === 'string' ? [body.moves] : []);
      if(moves.length > 64 || moves.some((m) => typeof m !== 'string' || m.length > 200)) {
        throw new GameError(400, 'moves must be an array of 5DPGN move strings');
      }
      let applied = 0;
      try {
        for(const m of moves) {
          game.move(seat, m.trim());
          applied++;
        }
        if(body.submit !== false) { game.submit(seat); }
      }
      catch(err) {
        for(let i = 0;i < applied;i++) {
          try { game.undo(seat); } catch(e) { break; }
        }
        if(err instanceof GameError && err.status !== 403 && !game.ended && seat === game.player) {
          err.legalMoves = game.legalMoves();
        }
        throw err;
      }
      return sendJson(res, 200, game.textState(seat));
    }

    if(action === 'undo' && req.method === 'POST') {
      game.undo(seat);
      return sendJson(res, 200, game.textState(seat));
    }

    if(action === 'resign' && req.method === 'POST') {
      game.resign(seat);
      return sendJson(res, 200, game.textState(seat));
    }

    // Long-poll until it's this seat's turn or the game ends
    // (spectators: until anything changes after `since`).
    if(action === 'wait' && req.method === 'GET') {
      const since = Number(url.searchParams.get('since') ?? -1);
      const timeoutMs = Math.min(Number(url.searchParams.get('timeout') ?? WAIT_DEFAULT_MS) || WAIT_DEFAULT_MS, WAIT_MAX_MS);
      const ready = () => game.removed || game.ended ||
        (seat === 'spectator' ? game.version > since : game.player === seat);
      if(ready()) { return sendJson(res, 200, game.textState(seat)); }
      await new Promise((resolve) => {
        let done = false;
        const finish = (timedOut) => {
          if(done) { return; }
          done = true;
          off();
          clearTimeout(timer);
          if(game.removed) { sendJson(res, 404, { error: 'Game expired' }); }
          else { sendJson(res, 200, Object.assign(game.textState(seat), timedOut ? { timeout: true } : {})); }
          resolve();
        };
        const off = game.onChange(() => { if(ready()) { finish(false); } });
        const timer = setTimeout(() => finish(true), timeoutMs);
        req.on('close', () => { if(!done) { done = true; off(); clearTimeout(timer); resolve(); } });
      });
      return;
    }

    throw new GameError(404, 'Not found');
  };

  const serveStatic = (req, res, url) => {
    if(!staticRoot) { res.writeHead(404); res.end('No client build configured'); return; }
    let rel = decodeURIComponent(url.pathname);
    if(rel === '/' || rel === '') { rel = '/index.html'; }
    const file = path.resolve(staticRoot, '.' + rel);
    if(!file.startsWith(staticRoot + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.stat(file, (err, st) => {
      if(err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
        'Content-Length': st.size,
        // Vite puts content hashes in asset names, so those can be cached forever
        'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      if(req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file).pipe(res);
    });
  };

  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://x'); }
    catch(err) { res.writeHead(400); res.end(); return; }
    try {
      if(url.pathname.startsWith('/api/')) {
        await routes(req, res, url);
      }
      else if(req.method === 'GET' || req.method === 'HEAD') {
        serveStatic(req, res, url);
      }
      else {
        throw new GameError(405, 'Method not allowed');
      }
    }
    catch(err) {
      if(res.headersSent) { return; }
      if(err instanceof GameError) {
        const body = { error: err.message };
        if(err.legalMoves) { body.legalMoves = err.legalMoves; }
        sendJson(res, err.status, body);
      }
      else {
        console.error(err);
        sendJson(res, 500, { error: 'Internal error' });
      }
    }
  });

  // WebSocket: /ws?game=<id>&seat=<token>
  // client -> server: {type:'move', move} {type:'undo'} {type:'submit'} {type:'resign'} {type:'nickname', nickname}
  // server -> client: {type:'state', state} {type:'error', message} {type:'gone'}
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY });
  server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch(err) { socket.destroy(); return; }
    const reject = (code, text) => {
      socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if(url.pathname !== '/ws') { return reject(404, 'Not Found'); }
    let game;
    try { game = store.get(url.searchParams.get('game')); } catch(err) { return reject(404, 'Not Found'); }
    const seat = game.seatFor(url.searchParams.get('seat'));
    if(!seat) { return reject(403, 'Forbidden'); }
    wss.handleUpgrade(req, socket, head, (ws) => onSocket(ws, game, seat));
  });

  const onSocket = (ws, game, seat) => {
    const limiter = socketMessageLimit();
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const send = (msg) => { if(ws.readyState === ws.OPEN) { ws.send(JSON.stringify(msg)); } };
    const off = game.onChange(() => {
      if(game.removed) { send({ type: 'gone' }); ws.close(4404, 'Game expired'); return; }
      send({ type: 'state', state: game.publicState(seat) });
    });
    game.connect(seat);
    send({ type: 'state', state: game.publicState(seat) });

    ws.on('message', (data) => {
      if(!limiter.allow('msg')) { send({ type: 'error', message: 'Too many messages' }); return; }
      let msg;
      try { msg = JSON.parse(data.toString()); } catch(err) { send({ type: 'error', message: 'Bad JSON' }); return; }
      try {
        if(msg.type === 'move') { game.move(seat, msg.move); }
        else if(msg.type === 'undo') { game.undo(seat); }
        else if(msg.type === 'submit') { game.submit(seat); }
        else if(msg.type === 'resign') { game.resign(seat); }
        else if(msg.type === 'nickname') { game.setNickname(seat, msg.nickname); }
        else if(msg.type === 'ping') { send({ type: 'pong' }); }
        else { send({ type: 'error', message: 'Unknown message type' }); }
      }
      catch(err) {
        send({ type: 'error', message: err instanceof GameError ? err.message : 'Internal error' });
        if(!(err instanceof GameError)) { console.error(err); }
        // Resync the client after a rejected action
        send({ type: 'state', state: game.publicState(seat) });
      }
    });
    ws.on('close', () => {
      off();
      if(!game.removed) { game.disconnect(seat); }
    });
  };

  // Drop dead sockets (phones that went to sleep) and expired games
  const heartbeat = setInterval(() => {
    for(const ws of wss.clients) {
      if(!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
    store.sweep();
  }, sweepIntervalMs);
  heartbeat.unref();
  server.on('close', () => clearInterval(heartbeat));

  return { server, store, wss, variants: VARIANTS };
};
