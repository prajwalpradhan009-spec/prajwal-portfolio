/**
 * A small in-memory rate limiter for the public chat endpoint.
 *
 * The Gemini key is a paid, shared resource, so the endpoint needs a limit
 * that stops one visitor from spending the daily quota. State is kept per
 * process in a Map: Render runs a single instance for this service, and the
 * limiter is a guard rail rather than a billing control.
 */

function createRateLimiter({ windowMs, max, keyFn, message }) {
  const hits = new Map();

  // Dropped buckets are cleared on a timer so a long-running process does not
  // keep every address it has ever seen. `unref` keeps the timer from holding
  // the event loop open.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [id, timestamps] of hits) {
      const recent = timestamps.filter(time => now - time < windowMs);
      if (recent.length) hits.set(id, recent);
      else hits.delete(id);
    }
  }, windowMs);
  if (typeof sweeper.unref === 'function') sweeper.unref();

  return function rateLimit(request, response, next) {
    const id = String(keyFn(request) || 'unknown');
    const now = Date.now();
    const recent = (hits.get(id) || []).filter(time => now - time < windowMs);

    if (recent.length >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
      hits.set(id, recent);
      response.set('Retry-After', String(retryAfterSeconds));
      response.set('Cache-Control', 'no-store');
      return response.status(429).json({
        error: { code: 'rate-limited', message, retryAfterSeconds },
      });
    }

    recent.push(now);
    hits.set(id, recent);
    return next();
  };
}

module.exports = { createRateLimiter };
