// Local preview of the website chat: node scripts/preview.js, then open
// http://localhost:3000/chat-preview.html
// Without ANTHROPIC_API_KEY it uses a stand-in "AI" that streams the instant
// answers word by word, so the chat can be tried without an API key.
const { createApp } = require('../src/app');
const { openDb } = require('../src/db');
const { loadConfig } = require('../src/config');
const { createAi } = require('../src/ai');
const { createAnswers } = require('../src/answers');

const config = loadConfig({ ...process.env, ALLOWED_ORIGINS: '*' });
const answers = createAnswers(config);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const standIn = async (messages, { onText } = {}) => {
  const text = answers.instant(messages[messages.length - 1].content).text;
  await sleep(400);
  for (const word of text.split(/(?<= )/)) { if (onText) onText(word); await sleep(45); }
  return text;
};
const ai = createAi(config) || standIn;
const senders = { emailEnabled: false, smsEnabled: false, email: async () => {}, sms: async () => {} };
createApp({ config, db: openDb(':memory:'), senders, ai }).listen(config.port, () => {
  console.log(`Chat preview: http://localhost:${config.port}/chat-preview.html (${ai === standIn ? 'stand-in AI' : config.aiModel})`);
});
