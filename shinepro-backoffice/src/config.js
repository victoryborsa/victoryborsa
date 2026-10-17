const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

function loadConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const config = {
    isProd,
    port: Number(env.PORT) || 3000,
    publicUrl: (env.PUBLIC_URL || `http://localhost:${Number(env.PORT) || 3000}`).replace(/\/$/, ''),
    dbFile: env.DATABASE_FILE || './data/shinepro.db',
    // Turnover report photos. Defaults to an "uploads" folder next to the database (same persistent disk).
    uploadsDir: '',
    uploadMaxMb: Number(env.UPLOAD_MAX_MB) || 8,
    businessName: env.BUSINESS_NAME || 'Shine Pro Cleaning',
    businessPhone: env.BUSINESS_PHONE || '(412) 447-8047',
    // Texting with customers happens in Google Voice (no API), so the admin opens it for you.
    googleVoiceNumber: env.GOOGLE_VOICE_NUMBER || env.BUSINESS_PHONE || '(412) 447-8047',
    adminPassword: env.ADMIN_PASSWORD || '',
    sessionSecret: env.SESSION_SECRET || '',
    allowedOrigins: (env.ALLOWED_ORIGINS || 'https://pghshinepro.com,https://www.pghshinepro.com')
      .split(',').map((s) => s.trim()).filter(Boolean),
    // The public website's address(es). Its forms post to /api/leads, /api/contact, /api/newsletter and /api/forms.
    siteOrigins: (env.SITE_ORIGINS || 'https://pghshinepro.com,https://www.pghshinepro.com')
      .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
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
    // GoDaddy Node.js Hosting: email goes through its built-in mail service instead of SMTP (no password needed).
    // On by default there when SMTP isn't set up; EMAIL_GATEWAY=godaddy or =off forces it either way.
    emailGateway: env.EMAIL_GATEWAY ? env.EMAIL_GATEWAY === 'godaddy' : Boolean(env.DB_HOST && !env.SMTP_HOST),
    // GoDaddy's managed MySQL (it sets these itself). When present, the data is backed up there continuously.
    mysql: env.DB_HOST ? {
      host: env.DB_HOST,
      port: Number(env.DB_PORT) || 3306,
      database: env.DB_NAME || '',
      user: env.DB_USER || '',
      password: env.DB_PASSWORD || '',
    } : null,
    twilio: {
      accountSid: env.TWILIO_ACCOUNT_SID || '',
      authToken: env.TWILIO_AUTH_TOKEN || '',
      from: env.TWILIO_FROM_NUMBER || '',
    },
    sendCustomerConfirmation: env.SEND_CUSTOMER_CONFIRMATION !== 'false',
    // Day-before reminder emails to clients, sent from this hour (Pittsburgh time). REMINDERS=false turns them off.
    reminders: env.REMINDERS !== 'false',
    reminderHour: Math.min(20, Math.max(6, Number(env.REMINDER_HOUR) || 10)),
    // Prices always come from public/pricing.js: the server recalculates every estimate it receives.
    // Failed emails/texts are retried automatically: 3 attempts in total, waiting this long (ms) before each retry.
    notifyRetryDelaysMs: (env.NOTIFY_RETRY_DELAYS_MS || '5000,30000').split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0),
    // Website chat
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    aiModel: env.AI_MODEL || 'claude-opus-5-5',
    firebase: {
      apiKey: env.FIREBASE_API_KEY || '',
      authDomain: env.FIREBASE_AUTH_DOMAIN || '',
      projectId: env.FIREBASE_PROJECT_ID || '',
    },
    // How customers start a chat:
    //  'none'  (default) the customer types name, email and phone and starts chatting right away.
    //  'codes' the customer must enter a code we email them (and a texted code via Firebase).
    chatVerification: env.CHAT_VERIFICATION === 'codes' ? 'codes' : 'none',
    // Only used with CHAT_VERIFICATION=codes. Only turn this off for local testing.
    requirePhoneVerification: env.REQUIRE_PHONE_VERIFICATION !== 'false',
  };

  config.uploadsDir = path.resolve(env.UPLOADS_DIR || (config.dbFile === ':memory:'
    ? path.join(os.tmpdir(), 'shinepro-uploads')
    : path.join(path.dirname(config.dbFile), 'uploads')));

  // On GoDaddy (MySQL present) the host may not set NODE_ENV, so treat it as live too: never fall back to a
  // default password. Its session secret can be left out: server.js then keeps a generated one in MySQL.
  if (config.mysql) {
    if (!env.PUBLIC_URL) config.publicUrl = 'https://admin.pghshinepro.com';
    if (!config.alertEmails.length) config.alertEmails = ['pghshinepro@gmail.com'];
  }
  if (isProd || config.mysql) {
    if (config.adminPassword.length < 10) throw new Error('ADMIN_PASSWORD must be set (10+ characters) in production');
    if (!config.mysql && config.sessionSecret.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters) in production');
  }
  if (!config.adminPassword) {
    config.adminPassword = 'changeme123';
    console.warn('[config] ADMIN_PASSWORD not set — using development password "changeme123"');
  }
  if (!config.sessionSecret) config.sessionSecret = crypto.randomBytes(32).toString('hex');
  return config;
}

module.exports = { loadConfig };
