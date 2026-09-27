const crypto = require('node:crypto');

function loadConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const config = {
    isProd,
    port: Number(env.PORT) || 3000,
    publicUrl: (env.PUBLIC_URL || `http://localhost:${Number(env.PORT) || 3000}`).replace(/\/$/, ''),
    dbFile: env.DATABASE_FILE || './data/shinepro.db',
    businessName: env.BUSINESS_NAME || 'Shine Pro Cleaning',
    businessPhone: env.BUSINESS_PHONE || '',
    adminPassword: env.ADMIN_PASSWORD || '',
    sessionSecret: env.SESSION_SECRET || '',
    allowedOrigins: (env.ALLOWED_ORIGINS || 'https://pghshinepro.com,https://www.pghshinepro.com')
      .split(',').map((s) => s.trim()).filter(Boolean),
    // Where new-lead alerts go (comma separated lists allowed)
    alertEmails: (env.ALERT_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean),
    alertPhones: (env.ALERT_PHONES || '').split(',').map((s) => s.trim()).filter(Boolean),
    smtp: {
      host: env.SMTP_HOST || '',
      port: Number(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === 'true',
      user: env.SMTP_USER || '',
      pass: env.SMTP_PASS || '',
      from: env.EMAIL_FROM || env.SMTP_USER || '',
      replyTo: env.EMAIL_REPLY_TO || '',
    },
    twilio: {
      accountSid: env.TWILIO_ACCOUNT_SID || '',
      authToken: env.TWILIO_AUTH_TOKEN || '',
      from: env.TWILIO_FROM_NUMBER || '',
    },
    sendCustomerConfirmation: env.SEND_CUSTOMER_CONFIRMATION !== 'false',
  };

  if (isProd) {
    if (config.adminPassword.length < 10) throw new Error('ADMIN_PASSWORD must be set (10+ characters) in production');
    if (config.sessionSecret.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters) in production');
  }
  if (!config.adminPassword) {
    config.adminPassword = 'changeme123';
    console.warn('[config] ADMIN_PASSWORD not set — using development password "changeme123"');
  }
  if (!config.sessionSecret) config.sessionSecret = crypto.randomBytes(32).toString('hex');
  return config;
}

module.exports = { loadConfig };
