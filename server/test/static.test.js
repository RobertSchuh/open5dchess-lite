//Static file serving: precompressed .gz variants are used when (and only
//when) the client accepts gzip, with identical content after decompression.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createApp } from '../src/app.js';

let app;
let base;
let dir;

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'o5d-static-'));
  writeFileSync(path.join(dir, 'index.html'), '<html>hi</html>');
  writeFileSync(path.join(dir, 'app.js'), 'console.log("big bundle")');
  writeFileSync(path.join(dir, 'app.js.gz'), gzipSync('console.log("big bundle")'));
  writeFileSync(path.join(dir, 'plain.css'), 'body{}'); //no .gz next to it
  app = createApp({ staticDir: dir });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(() => {
  app.server.closeAllConnections();
  app.server.close();
  rmSync(dir, { recursive: true, force: true });
});

//fetch() decompresses transparently; use raw headers to assert the wire format
const raw = (p, headers = {}) => fetch(base + p, { headers });

test('serves .gz variant to gzip-accepting clients', async () => {
  const res = await raw('/app.js', { 'accept-encoding': 'gzip' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-encoding'), 'gzip');
  assert.equal(res.headers.get('vary'), 'Accept-Encoding');
  assert.match(res.headers.get('content-type'), /^text\/javascript/);
  assert.equal(await res.text(), 'console.log("big bundle")');
});

test('serves identity when gzip is not accepted or no .gz exists', async () => {
  const plain = await raw('/app.js', { 'accept-encoding': 'identity' });
  assert.equal(plain.headers.get('content-encoding'), null);
  assert.equal(await plain.text(), 'console.log("big bundle")');

  const css = await raw('/plain.css', { 'accept-encoding': 'gzip' });
  assert.equal(css.headers.get('content-encoding'), null);
  assert.equal(await css.text(), 'body{}');
});

test('gzip content-length matches the compressed size', async () => {
  //fetch decompresses the body but reports the wire headers
  const res = await raw('/app.js', { 'accept-encoding': 'gzip' });
  assert.equal(Number(res.headers.get('content-length')), gzipSync('console.log("big bundle")').length);
  assert.equal(await res.text(), 'console.log("big bundle")');
});
