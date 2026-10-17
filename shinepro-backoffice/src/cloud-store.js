// Keeps the data safe on hosts whose disk is wiped on every deploy or restart (GoDaddy Node.js Hosting).
// The app keeps working on its local SQLite file as usual. This module:
//  - on start, restores the latest copy of that file (and the uploaded photos) from the host's MySQL database;
//  - every few seconds, if anything changed, saves a fresh copy of the file to MySQL (keeping the last few copies);
//  - mirrors new and deleted photo files in the uploads folder to MySQL.
// Only used when DB_HOST is set. Run a single instance of the app, since each instance has its own SQLite file.
const fs = require('node:fs');
const path = require('node:path');

const KEEP_SNAPSHOTS = 20;

const TABLES = [
  `CREATE TABLE IF NOT EXISTS shinepro_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    size INT NOT NULL,
    data LONGBLOB NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS shinepro_settings (
    name VARCHAR(64) NOT NULL PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS shinepro_files (
    path VARCHAR(255) NOT NULL PRIMARY KEY,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data LONGBLOB NOT NULL
  )`,
];

function listFiles(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listFiles(full, base);
    return e.isFile() ? [path.relative(base, full).split(path.sep).join('/')] : [];
  });
}

// `pool` is a mysql2/promise pool (or anything with the same execute()); tests pass a stand-in.
function createCloudStore({ pool, dbFile, uploadsDir, intervalMs = 3000, log = console }) {
  let lastChanges = null;
  let knownFiles = new Set();
  let timer = null;
  let running = Promise.resolve();

  async function init() {
    for (const sql of TABLES) await pool.execute(sql);
  }

  // Before the app opens its database: bring back the latest saved copy and the photos.
  async function restore() {
    await init();
    const [rows] = await pool.execute('SELECT id, data FROM shinepro_snapshots ORDER BY id DESC LIMIT 1');
    if (rows.length) {
      fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });
      for (const ext of ['', '-wal', '-shm']) fs.rmSync(dbFile + ext, { force: true });
      fs.writeFileSync(dbFile, rows[0].data);
      log.log(`Restored saved data (copy #${rows[0].id}, ${rows[0].data.length} bytes)`);
    }
    const [files] = await pool.execute('SELECT path, data FROM shinepro_files');
    for (const f of files) {
      const target = path.join(uploadsDir, f.path);
      if (!target.startsWith(path.resolve(uploadsDir) + path.sep)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, f.data);
    }
    knownFiles = new Set(files.map((f) => f.path));
    return { restored: rows.length > 0, files: files.length };
  }

  // A value generated once and kept in MySQL (used for the login-cookie secret when none is set).
  async function setting(name, make) {
    await init();
    await pool.execute('INSERT IGNORE INTO shinepro_settings (name, value) VALUES (?, ?)', [name, make()]);
    const [rows] = await pool.execute('SELECT value FROM shinepro_settings WHERE name = ?', [name]);
    return rows[0].value;
  }

  async function saveSnapshot(db) {
    const tmp = `${dbFile}.snapshot`;
    fs.rmSync(tmp, { force: true });
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const data = fs.readFileSync(tmp);
    fs.rmSync(tmp, { force: true });
    const [res] = await pool.execute('INSERT INTO shinepro_snapshots (size, data) VALUES (?, ?)', [data.length, data]);
    await pool.execute('DELETE FROM shinepro_snapshots WHERE id <= ?', [res.insertId - KEEP_SNAPSHOTS]);
  }

  async function syncFiles() {
    const now = new Set(listFiles(uploadsDir));
    for (const p of now) {
      if (knownFiles.has(p)) continue;
      await pool.execute('REPLACE INTO shinepro_files (path, data) VALUES (?, ?)', [p, fs.readFileSync(path.join(uploadsDir, p))]);
      knownFiles.add(p);
    }
    for (const p of knownFiles) {
      if (now.has(p)) continue;
      await pool.execute('DELETE FROM shinepro_files WHERE path = ?', [p]);
      knownFiles.delete(p);
    }
  }

  // One save pass: a new copy only when the database changed since the last one.
  function flush(db) {
    running = running.then(async () => {
      const changes = db.prepare('SELECT total_changes() AS n').get().n;
      if (changes !== lastChanges) {
        await saveSnapshot(db);
        lastChanges = changes;
      }
      await syncFiles();
    }).catch((err) => log.error('Saving data to MySQL failed (will retry):', err.message));
    return running;
  }

  function watch(db) {
    lastChanges = null; // first pass always saves, so a fresh install has a copy at once
    flush(db);
    timer = setInterval(() => flush(db), intervalMs);
    timer.unref();
  }

  async function stop(db) {
    if (timer) clearInterval(timer);
    timer = null;
    if (db) await flush(db);
  }

  return { restore, setting, watch, flush, stop };
}

module.exports = { createCloudStore, listFiles };
