const { loadConfig } = require('./config');
const { createApp } = require('./app');

const config = loadConfig();
const app = createApp({ config });

app.listen(config.port, () => {
  console.log(`${config.businessName} back office running on port ${config.port}`);
  console.log(`  Admin:      ${config.publicUrl}/admin`);
  console.log(`  Quote form: ${config.publicUrl}/quote`);
});
