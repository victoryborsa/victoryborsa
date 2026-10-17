// GoDaddy hosting: data kept in MySQL across restarts, and email through GoDaddy's mail service.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { DatabaseSync } = require('node:sqlite');
const { createCloudStore } = require('../src/cloud-store');
const { sendViaGateway } = require('../src/mail-gateway');
const { loadConfig } = require('../src/config');

// Stand-in for a mysql2 pool that understands the few statements cloud-store uses.
function fakePool() {
  const snaps = [];
  const files = new Map();
  const settings = new Map();
  let nextId = 1;
  return {
    snaps,
    files,
    async execute(sql, params = []) {
      const s = sql.trim();
      if (s.startsWith('CREATE TABLE')) return [{}];
      if (s.startsWith('SELECT id, data FROM shinepro_snapshots')) return [snaps.slice(-1).map((x) => ({ id: x.id, data: x.data }))];
      if (s.startsWith('SELECT path, data FROM shinepro_files')) return [[...files].map(([p, data]) => ({ path: p, data }))];
      if (s.startsWith('INSERT INTO shinepro_snapshots')) { const id = nextId++; snaps.push({ id, size: params[0], data: Buffer.from(params[1]) }); return [{ insertId: id }]; }
      if (s.startsWith('DELETE FROM shinepro_snapshots')) { for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].id <= params[0]) snaps.splice(i, 1); return [{}]; }
      if (s.startsWith('REPLACE INTO shinepro_files')) { files.set(params[0], Buffer.from(params[1])); return [{}]; }
      if (s.startsWith('DELETE FROM shinepro_files')) { files.delete(params[0]); return [{}]; }
      if (s.startsWith('INSERT IGNORE INTO shinepro_settings')) { if (!settings.has(params[0])) settings.set(params[0], params[1]); return [{}]; }
      if (s.startsWith('SELECT value FROM shinepro_settings')) return [[{ value: settings.get(params[0]) }]];
      throw new Error(`unexpected SQL: ${s}`);
    },
  };
}

const quiet = { log() {}, error() {} };
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'shinepro-gd-'));

test('data and photos survive a wiped disk through MySQL', async () => {
  const pool = fakePool();

  // First server: starts empty, books something, uploads a photo.
  const dir1 = tmpDir();
  const store1 = createCloudStore({ pool, dbFile: path.join(dir1, 'shinepro.db'), uploadsDir: path.join(dir1, 'uploads'), log: quiet });
  assert.deepStrictEqual(await store1.restore(), { restored: false, files: 0 });
  const db1 = new DatabaseSync(path.join(dir1, 'shinepro.db'));
  db1.exec('CREATE TABLE jobs (id INTEGER PRIMARY KEY, who TEXT)');
  await store1.flush(db1);
  const afterFirst = pool.snaps.length;
  await store1.flush(db1);
  assert.strictEqual(pool.snaps.length, afterFirst, 'no new copy when nothing changed');

  db1.prepare('INSERT INTO jobs (who) VALUES (?)').run('Lee Park');
  fs.mkdirSync(path.join(dir1, 'uploads/jobs/1'), { recursive: true });
  fs.writeFileSync(path.join(dir1, 'uploads/jobs/1/a.jpg'), 'photo-bytes');
  fs.writeFileSync(path.join(dir1, 'uploads/jobs/1/b.jpg'), 'gone-soon');
  await store1.flush(db1);
  assert.strictEqual(pool.snaps.length, afterFirst + 1);
  fs.rmSync(path.join(dir1, 'uploads/jobs/1/b.jpg'));
  await store1.flush(db1);
  assert.deepStrictEqual([...pool.files.keys()], ['jobs/1/a.jpg']);
  await store1.stop(db1);
  db1.close();

  // Redeploy: brand-new empty disk, same MySQL.
  const dir2 = tmpDir();
  const store2 = createCloudStore({ pool, dbFile: path.join(dir2, 'shinepro.db'), uploadsDir: path.join(dir2, 'uploads'), log: quiet });
  assert.deepStrictEqual(await store2.restore(), { restored: true, files: 1 });
  const db2 = new DatabaseSync(path.join(dir2, 'shinepro.db'));
  assert.strictEqual(db2.prepare('SELECT who FROM jobs').get().who, 'Lee Park');
  assert.strictEqual(fs.readFileSync(path.join(dir2, 'uploads/jobs/1/a.jpg'), 'utf8'), 'photo-bytes');
  db2.close();
});

test('the login secret is generated once and kept', async () => {
  const pool = fakePool();
  const dir = tmpDir();
  const store = createCloudStore({ pool, dbFile: path.join(dir, 'shinepro.db'), uploadsDir: path.join(dir, 'uploads'), log: quiet });
  const a = await store.setting('session_secret', () => 'first');
  const b = await store.setting('session_secret', () => 'second');
  assert.strictEqual(a, 'first');
  assert.strictEqual(b, 'first');
});

test('only the last 20 copies are kept', async () => {
  const pool = fakePool();
  const dir = tmpDir();
  const store = createCloudStore({ pool, dbFile: path.join(dir, 'shinepro.db'), uploadsDir: path.join(dir, 'uploads'), log: quiet });
  await store.restore();
  const db = new DatabaseSync(path.join(dir, 'shinepro.db'));
  db.exec('CREATE TABLE t (n INTEGER)');
  for (let i = 0; i < 25; i++) { db.prepare('INSERT INTO t VALUES (?)').run(i); await store.flush(db); }
  assert.strictEqual(pool.snaps.length, 20);
  db.close();
});

test('a failed save is retried on the next pass', async () => {
  const pool = fakePool();
  const real = pool.execute;
  let fail = true;
  pool.execute = async (sql, p) => { if (fail && sql.startsWith('INSERT')) throw new Error('MySQL went away'); return real(sql, p); };
  const dir = tmpDir();
  const store = createCloudStore({ pool, dbFile: path.join(dir, 'shinepro.db'), uploadsDir: path.join(dir, 'uploads'), log: quiet });
  await store.restore();
  const db = new DatabaseSync(path.join(dir, 'shinepro.db'));
  db.exec('CREATE TABLE t (n INTEGER)');
  await store.flush(db);
  assert.strictEqual(pool.snaps.length, 0);
  fail = false;
  await store.flush(db);
  assert.strictEqual(pool.snaps.length, 1);
  db.close();
});

test('emails go through the GoDaddy mail service with the calendar file attached', async () => {
  let got;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      got = { path: req.url, body: JSON.parse(body) };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ success: true, messageId: 'm-1' }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/api/email/send`;
  const out = await sendViaGateway({
    to: 'lee@example.com', subject: 'Booked', text: 'See you', html: '<p>See you</p>', replyTo: 'pghshinepro@gmail.com',
    attachments: [{ filename: 'cleaning.ics', content: 'BEGIN:VCALENDAR', contentType: 'text/calendar' }],
  }, { url });
  assert.deepStrictEqual(out, { messageId: 'm-1' });
  assert.strictEqual(got.path, '/api/email/send');
  assert.deepStrictEqual(got.body.to, ['lee@example.com']);
  assert.strictEqual(got.body.from, undefined, 'GoDaddy picks the sender');
  assert.strictEqual(got.body.replyTo, 'pghshinepro@gmail.com');
  assert.strictEqual(Buffer.from(got.body.attachments[0].content, 'base64').toString(), 'BEGIN:VCALENDAR');

  // A refusal becomes an error the notifier logs and retries.
  server.removeAllListeners('request');
  server.on('request', (req, res) => { req.resume(); res.statusCode = 400; res.end(JSON.stringify({ success: false, error: 'bad address' })); });
  await assert.rejects(sendViaGateway({ to: 'x', subject: 's', text: 't' }, { url }), /bad address/);
  server.close();
});

test('on GoDaddy, email works without SMTP and MySQL is picked up', () => {
  const c = loadConfig({ DB_HOST: 'db.internal', DB_NAME: 'app', DB_USER: 'u', DB_PASSWORD: 'p', ADMIN_PASSWORD: 'a-long-password' });
  assert.strictEqual(c.publicUrl, 'https://admin.pghshinepro.com');
  assert.deepStrictEqual(c.alertEmails, ['pghshinepro@gmail.com']);
  // Never the default password on a live server, even when NODE_ENV isn't set.
  assert.throws(() => loadConfig({ DB_HOST: 'db' }), /ADMIN_PASSWORD/);
  assert.throws(() => loadConfig({ EMAIL_GATEWAY: 'godaddy' }), /ADMIN_PASSWORD/);
  assert.strictEqual(c.emailGateway, true);
  assert.deepStrictEqual(c.mysql, { host: 'db.internal', port: 3306, database: 'app', user: 'u', password: 'p' });
  assert.strictEqual(loadConfig({ DB_HOST: 'db', SMTP_HOST: 'smtp.gmail.com', ADMIN_PASSWORD: 'a-long-password' }).emailGateway, false);
  assert.strictEqual(loadConfig({}).emailGateway, false);
  assert.strictEqual(loadConfig({}).mysql, null);
});
