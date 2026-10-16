// Bookings are typed in Pittsburgh time. Without this, a server running on UTC (like Render) counts
// "upcoming" jobs and today's date 4-5 hours off. Set TZ in the host's settings to override.
process.env.TZ = process.env.TZ || 'America/New_York';

const { loadConfig } = require('./config');
const { createApp } = require('./app');

const config = loadConfig();
const app = createApp({ config });
app.locals.startReminders();

app.listen(config.port, () => {
  console.log(`${config.businessName} back office running on port ${config.port}`);
  console.log(`  Admin:      ${config.publicUrl}/admin`);
  console.log(`  Quote form: ${config.publicUrl}/quote`);
});
