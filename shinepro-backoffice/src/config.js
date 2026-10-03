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
    // Where prices come from:
    //  'site'    (default) the website already has its own prices/quote form. Leads keep the price the
    //            website sent, and the chat assistant never quotes numbers (sends people to the quote form).
    //  'package' use the price table in public/pricing.js everywhere (quote widget, leads, chat).
    priceSource: env.PRICE_SOURCE === 'package' ? 'package' : 'site',
    // Website chat
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    aiModel: env.AI_MODEL || 'claude-opus-5',
    firebase: {
      apiKey: env.FIREBASE_API_KEY || '',
      authDomain: env.FIREBASE_AUTH_DOMAIN || '',
      projectId: env.FIREBASE_PROJECT_ID || '',
    },
    // Only turn this off for local testing. The owner requires verified phone numbers.
    requirePhoneVerification: env.REQUIRE_PHONE_VERIFICATION !== 'false',
  };

  config.uploadsDir = path.resolve(env.UPLOADS_DIR || (config.dbFile === ':memory:'
    ? path.join(os.tmpdir(), 'shinepro-uploads')
    : path.join(path.dirname(config.dbFile), 'uploads')));

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
