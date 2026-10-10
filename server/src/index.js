// Entry point. Env: PORT (8090), HOST (127.0.0.1), STATIC_DIR (../client/dist),
// PUBLIC_URL (base for invite links; default: taken from the request's Host header).
import path from 'node:path';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 8090);
const host = process.env.HOST || '127.0.0.1';
const staticDir = process.env.STATIC_DIR || path.resolve(import.meta.dirname, '../../client/dist');

const { server, wss } = createApp({ staticDir, publicUrl: process.env.PUBLIC_URL || null });
server.listen(port, host, () => {
  console.log(`open5dchess server on http://${host}:${port} (static: ${staticDir})`);
});

const shutdown = () => {
  for(const ws of wss.clients) { ws.close(1001, 'Server shutting down'); }
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
