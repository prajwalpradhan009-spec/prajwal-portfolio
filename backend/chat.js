/**
 * POST /api/chat — Prajwal AI.
 *
 * The browser never talks to Gemini directly. It posts a message (plus the
 * short conversation it already holds in memory) here, and this route asks the
 * Gemini service for one reply. Input is validated and length limited before
 * anything reaches Google, requests are rate limited, and failures are
 * translated into a small, safe error body: no key, no SDK message and no
 * stack ever leaves the server.
 */

const express = require('express');
const { generateReply, isGeminiConfigured, scrubSecrets, GeminiError } = require('./gemini');
const { createRateLimiter } = require('./rateLimit');

const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 20;
const VALID_ROLES = new Set(['user', 'model']);

// A conversation is bounded by the message limits, so the body limit only has
// to be generous enough for the largest history the route accepts.
const BODY_LIMIT = '96kb';

const RATE_LIMIT = (() => {
  const configured = Number(process.env.CHAT_RATE_LIMIT);
  return {
    windowMs: 10 * 60 * 1000,
    // The default is deliberately low. Gemini's free tier only allows a small
    // number of requests per day in total, so a generous per-visitor limit
    // would let one visitor spend the whole daily budget in a few minutes.
    max: Number.isFinite(configured) ? Math.min(Math.max(configured, 1), 200) : 5,
    message: 'Too many questions at once. Please try again in a few minutes.',
  };
})();

/**
 * Validates the request body.
 * @returns {{ value?: { message: string, history: Array<{ role: string, text: string }> }, error?: string }}
 */
function validateChatRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Send a JSON object with a "message" field.' };
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return { error: 'Your message cannot be empty.' };
  if (message.length > MAX_MESSAGE_LENGTH) {
    return { error: `Your message is too long. Keep it under ${MAX_MESSAGE_LENGTH} characters.` };
  }

  const history = [];
  if (body.history !== undefined) {
    if (!Array.isArray(body.history)) return { error: '"history" must be an array of messages.' };
    if (body.history.length > MAX_HISTORY_MESSAGES) {
      return { error: `The conversation is too long. Keep at most ${MAX_HISTORY_MESSAGES} previous messages.` };
    }

    for (const turn of body.history) {
      if (!turn || typeof turn !== 'object' || Array.isArray(turn)) {
        return { error: 'Each history entry must be an object with "role" and "text".' };
      }
      const role = String(turn.role || '').toLowerCase();
      const text = typeof turn.text === 'string' ? turn.text.trim() : '';
      if (!VALID_ROLES.has(role)) return { error: 'History roles must be "user" or "model".' };
      if (!text) return { error: 'History entries cannot be empty.' };
      if (text.length > MAX_MESSAGE_LENGTH) {
        return { error: `A previous message is too long. Keep each message under ${MAX_MESSAGE_LENGTH} characters.` };
      }
      history.push({ role, text });
    }
  }

  return { value: { message, history } };
}

const chatLimiter = createRateLimiter({
  ...RATE_LIMIT,
  // Render terminates TLS at its proxy, so the real visitor address arrives in
  // X-Forwarded-For. This server trusts the first hop only (see server.js).
  keyFn: request => request.ip || request.socket?.remoteAddress || 'unknown',
});

/**
 * Answer cache.
 *
 * The Gemini free tier allows only a handful of requests per day, which is far
 * less than a portfolio page attracts, and the quick-action chips mean most
 * visitors ask the same handful of questions. Caching the first question of a
 * conversation means those repeat questions cost nothing after the first ask,
 * which is the difference between the assistant working most of the day and
 * being permanently out of quota.
 *
 * Only messages that arrive with no history are cached. A question asked mid
 * conversation depends on what came before it, so a stored answer would be
 * wrong in a different context. The cache lives in memory only: nothing is
 * written to disk or the database, and it disappears when the server restarts.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const answerCache = new Map();

function cacheKeyFor(message) {
  return message.toLowerCase().replace(/\s+/g, ' ').trim();
}

function readCachedAnswer(key) {
  const hit = answerCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    answerCache.delete(key);
    return null;
  }
  return hit.reply;
}

function writeCachedAnswer(key, reply) {
  // Map preserves insertion order, so the oldest entry is the first key.
  if (answerCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = answerCache.keys().next().value;
    if (oldest !== undefined) answerCache.delete(oldest);
  }
  answerCache.set(key, { reply, at: Date.now() });
}

function registerChatRoutes(app) {
  app.post(
    '/api/chat',
    express.json({ limit: BODY_LIMIT }),
    chatLimiter,
    async (request, response) => {
      response.set('Cache-Control', 'no-store');

      const { value, error } = validateChatRequest(request.body);
      if (error) {
        return response.status(400).json({ error: { code: 'invalid-request', message: error } });
      }

      const cacheable = value.history.length === 0;
      const cacheKey = cacheable ? cacheKeyFor(value.message) : null;
      if (cacheKey) {
        const cached = readCachedAnswer(cacheKey);
        if (cached) return response.json({ reply: cached, cached: true });
      }

      try {
        const reply = await generateReply(value);
        if (cacheKey) writeCachedAnswer(cacheKey, reply);
        return response.json({ reply });
      } catch (chatError) {
        const status = chatError instanceof GeminiError ? chatError.status : 500;
        const code = chatError instanceof GeminiError ? chatError.code : 'internal-error';
        const details = chatError instanceof GeminiError ? chatError.details : {};

        // Only the failure code, HTTP status and reason are logged — never the
        // visitor's message, never the API key, never a raw SDK payload.
        const reason = scrubSecrets(
          Object.keys(details).length ? `${chatError.message} ${JSON.stringify(details)}` : chatError?.message
        );
        console.error(`[chat] POST /api/chat failed (${code}, HTTP ${status}): ${reason || 'unknown error'}`);

        // The client only ever receives a code and a short, safe sentence.
        if (details.retryAfterSeconds) response.set('Retry-After', String(details.retryAfterSeconds));
        return response.status(status).json({
          error: { code, message: 'Prajwal AI is unavailable right now. Please try again shortly.' },
        });
      }
    }
  );
}

module.exports = {
  registerChatRoutes,
  isGeminiConfigured,
};
