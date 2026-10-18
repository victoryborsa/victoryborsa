// Bookings are typed in Pittsburgh time. Without this, a server running on UTC (like Render) counts
// "upcoming" jobs and today's date 4-5 hours off. Set TZ in the host's settings to override.
process.env.TZ = process.env.TZ || 'America/New_York';

const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { createCloudStore } = require('./cloud-store');

async function main() {
  const config = loadConfig();

  // On GoDaddy the disk is wiped on every deploy, so the data lives in its MySQL database too.
  // If it can't be restored, stop rather than start empty (the host restarts the app and tries again).
  let cloud = null;
  if (config.mysql) {
    const mysql = require('mysql2/promise');
    const pool = mysql.createPool({ ...config.mysql, connectionLimit: 2 });
    cloud = createCloudStore({ pool, dbFile: config.dbFile, uploadsDir: config.uploadsDir });
    if (!process.env.SESSION_SECRET) config.sessionSecret = await cloud.setting('session_secret', () => require('node:crypto').randomBytes(32).toString('hex'));
    const r = await cloud.restore();
    if (!r.restored) console.log('No saved data in MySQL yet: starting fresh.');
  }

  const app = createApp({ config });
  app.locals.startReminders();
  if (cloud) {
    cloud.watch(app.locals.db);
    const shutdown = () => cloud.stop(app.locals.db).finally(() => process.exit(0));
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`${config.businessName} back office running on port ${config.port}`);
    console.log(`  Admin:      ${config.publicUrl}/admin`);
    console.log(`  Quote form: ${config.publicUrl}/quote`);
  });
}

main().catch((err) => {
  console.error('Could not start:', err.message);
  process.exit(1);
});
