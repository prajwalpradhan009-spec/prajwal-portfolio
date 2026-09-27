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
    max: Number.isFinite(configured) ? Math.min(Math.max(configured, 1), 200) : 20,
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

      try {
        const reply = await generateReply(value);
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
