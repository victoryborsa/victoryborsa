const fs = require('node:fs');
const path = require('node:path');
const Anthropic = require('@anthropic-ai/sdk').default;
const { PRICING } = require('../public/pricing');

const KNOWLEDGE_FILE = path.join(__dirname, '..', 'knowledge.md');

// The system prompt is built once at startup and never changes per request,
// so it stays byte-identical and is served from the prompt cache.
function buildSystemPrompt(config) {
  const knowledge = fs.existsSync(KNOWLEDGE_FILE) ? fs.readFileSync(KNOWLEDGE_FILE, 'utf8') : '';
  const services = Object.values(PRICING.services).map((s) => `- ${s.label}: starts at $${s.base}`).join('\n');
  const freq = Object.values(PRICING.frequency).map((f) => `- ${f.label}: ${Math.round(f.discount * 100)}% off each visit`).join('\n');
  const pricing = config.priceSource === 'package'
    ? `- You can give price estimates using the pricing rules below. Always call them estimates; the team confirms the final price.

Pricing rules (estimates, per visit):
${services}
- Add $${PRICING.perBedroom} per bedroom and $${PRICING.perBathroom} per bathroom.
- Homes over ${PRICING.perSqftOver.threshold} sq ft: add $${PRICING.perSqftOver.per1000} per extra 1,000 sq ft (or part of it).
Recurring discounts:
${freq}`
    : `- Do NOT state any specific prices or dollar amounts, even if asked, unless they appear in the business information below. For a price, point the customer to the instant quote on our website (pghshinepro.com), or offer to have the team call with a quote: ask for the type of cleaning, number of bedrooms and bathrooms, and how often, then suggest "Request a call back".`;

  return `You are the website chat assistant for ${config.businessName}, a house cleaning company in Pittsburgh, PA.
You are chatting with a customer whose name, email and phone number have already been verified.

How to answer:
- Be warm, clear and brief: usually 1-3 short sentences, plain text, no markdown headings.
- Only state facts that appear in the business information below. If you don't know something (exact availability, a special request, anything not listed), say the team will confirm and suggest tapping "Request a call back" or calling/texting ${config.businessPhone}.
${pricing}
- You cannot book, reschedule or cancel appointments yourself. When someone wants to book, collect the preferred date/time and address in the chat, tell them the team will confirm shortly, and suggest "Request a call back" if they'd like a call.
- If the customer is upset, has a complaint, or asks for a person, apologize briefly and point them to "Request a call back" or ${config.businessPhone}.
- Stay on topic (cleaning services and this business). Politely decline unrelated requests.
- Never ask for payment card details, passwords, or other sensitive information.

Business information:
${knowledge}`;
}

function createAi(config) {
  if (!config.anthropicApiKey) return null;
  const client = new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 2, timeout: 60_000 });
  const system = buildSystemPrompt(config);

  // messages: Anthropic.MessageParam[] (history, oldest first, starts with a user turn)
  return async function reply(messages) {
    try {
      const response = await client.beta.messages.create({
        model: config.aiModel,
        max_tokens: 4096,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' }, // short customer-service answers
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages,
      });
      if (response.stop_reason === 'refusal') return null;
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      return text || null;
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) console.error('[ai] rate limited');
      else if (err instanceof Anthropic.AuthenticationError) console.error('[ai] invalid ANTHROPIC_API_KEY');
      else if (err instanceof Anthropic.APIError) console.error(`[ai] API error ${err.status}: ${err.message}`);
      else console.error('[ai] error', err.message);
      return null;
    }
  };
}

module.exports = { createAi, buildSystemPrompt };
