/**
 * Prajwal AI — the portfolio assistant.
 *
 * The browser only ever talks to this site's own backend at POST /api/chat.
 * The Gemini API key lives in the server environment and is never referenced
 * here. Everything below is presentation and request handling: open/close,
 * conversation state for the current page view, safe Markdown rendering,
 * accessibility and the mobile keyboard.
 *
 * If the backend is missing or failing, the assistant shows one friendly line
 * and the rest of the portfolio keeps working exactly as before.
 */

(() => {
  const root = document.querySelector('[data-ai-root]');
  if (!root) return;

  const el = {
    toggle: root.querySelector('[data-ai-toggle]'),
    panel: root.querySelector('[data-ai-panel]'),
    minimize: root.querySelector('[data-ai-minimize]'),
    close: root.querySelector('[data-ai-close]'),
    status: root.querySelector('[data-ai-status]'),
    log: root.querySelector('[data-ai-log]'),
    suggestions: root.querySelector('[data-ai-suggestions]'),
    jumps: root.querySelector('[data-ai-jumps]'),
    form: root.querySelector('[data-ai-form]'),
    input: root.querySelector('[data-ai-input]'),
    send: root.querySelector('[data-ai-send]'),
    count: root.querySelector('[data-ai-count]'),
  };
  if (!el.toggle || !el.panel || !el.log || !el.form || !el.input || !el.send) return;

  const isLocal =
    window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const apiBase = window.PORTFOLIO_API_URL || (isLocal ? 'http://127.0.0.1:3000/api' : `${window.location.origin}/api`);

  const MAX_LENGTH = 2000;
  const REQUEST_TIMEOUT_MS = 30000;
  // Only the last few turns are sent back to the model. It is enough for
  // follow-up questions and keeps every request small.
  const HISTORY_LIMIT = 10;

  const WELCOME_MESSAGE =
    "Hi! I'm Prajwal AI 👋\nI can tell you about Prajwal, his skills, projects, education, and how to contact him.\n\nWhat would you like to know?";
  const GENERIC_ERROR =
    "Sorry, I'm having trouble connecting right now. Please try again or use the contact section.";
  const RATE_LIMIT_ERROR =
    'Prajwal AI is answering a lot of questions right now. Please try again in a few minutes.';
  // The Gemini free tier allows only a small number of requests per day, and
  // that runs out for everyone at once. Saying so plainly is far more useful
  // than "trouble connecting", and there is no point offering a retry button,
  // because the next attempt will fail the same way.
  const QUOTA_ERROR =
    "Prajwal AI has used up its free question quota for today, so it is taking a break. Please try again tomorrow, or use the contact section.";
  const TOO_LONG_ERROR = `That message is too long. Please keep it under ${MAX_LENGTH} characters.`;

  const state = {
    open: false,
    busy: false,
    // Conversation memory for this page view only. Nothing is stored, logged
    // or sent anywhere except the POST /api/chat request that needs it.
    messages: [],
  };

  const touchDevice = window.matchMedia('(hover: none)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ------------------------------------------------------------- utils */

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function iconElement(name) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'currentColor');
    node.setAttribute('stroke-width', '1.9');
    node.setAttribute('stroke-linecap', 'round');
    node.setAttribute('stroke-linejoin', 'round');
    node.setAttribute('aria-hidden', 'true');
    node.append(...PATHS[name].map(d => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      return path;
    }));
    return node;
  }

  const PATHS = {
    sparkle: ['M11 3.5 12.5 7.7 16.7 9.2 12.5 10.7 11 14.9 9.5 10.7 5.3 9.2 9.5 7.7z'],
    alert: ['M12 4 2.6 20h18.8z', 'M12 10.2v4.1', 'M12 17.4v.01'],
  };

  /* ------------------------------------------------ safe markdown text */

  // The reply is never treated as HTML. Text is split into blocks and inline
  // tokens, and every node is created with textContent, so model output can
  // never inject markup, scripts or styles into the page.

  const INLINE_PATTERN = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\n]+\*)/g;

  function renderInline(target, text) {
    let lastIndex = 0;
    let match;

    INLINE_PATTERN.lastIndex = 0;
    while ((match = INLINE_PATTERN.exec(text)) !== null) {
      if (match.index > lastIndex) target.append(document.createTextNode(text.slice(lastIndex, match.index)));
      const token = match[0];
      if (token.startsWith('**')) target.append(createElement('strong', null, token.slice(2, -2)));
      else if (token.startsWith('`')) target.append(createElement('code', null, token.slice(1, -1)));
      else target.append(createElement('em', null, token.slice(1, -1)));
      lastIndex = match.index + token.length;
    }
    if (lastIndex < text.length) target.append(document.createTextNode(text.slice(lastIndex)));
  }

  const BULLET = /^\s*[-*+•]\s+(.*)$/;
  const ORDERED = /^\s*(\d{1,2})[.)]\s+(.*)$/;

  function renderMarkdown(target, raw) {
    const lines = String(raw).replace(/\r\n/g, '\n').split('\n');
    let list = null;
    let listType = '';

    const closeList = () => {
      list = null;
      listType = '';
    };

    lines.forEach(line => {
      const trimmed = line.trim();

      if (!trimmed) {
        closeList();
        return;
      }

      // A heading is treated as a short bold paragraph: the chat has no
      // heading scale of its own.
      const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (heading) {
        closeList();
        const paragraph = createElement('p');
        renderInline(paragraph, heading[2]);
        target.append(paragraph);
        return;
      }

      const bullet = BULLET.exec(trimmed);
      const ordered = ORDERED.exec(trimmed);

      if (bullet || ordered) {
        const text = (bullet ? bullet[1] : ordered[2]).trim();
        // A rule such as `* * *` is not a list item.
        if (!text || /^[*_#-]+$/.test(text)) {
          closeList();
          return;
        }
        const type = bullet ? 'ul' : 'ol';
        if (!list || listType !== type) {
          closeList();
          list = createElement(type);
          listType = type;
          target.append(list);
        }
        const item = createElement('li');
        renderInline(item, text);
        list.append(item);
        return;
      }

      closeList();
      const paragraph = createElement('p');
      renderInline(paragraph, trimmed);
      target.append(paragraph);
    });

    closeList();
  }

  /* ------------------------------------------------------------ layout */

  function scrollToLatest() {
    // The log is the only scroll container that moves, so the page behind the
    // assistant never jumps.
    window.requestAnimationFrame(() => {
      el.log.scrollTop = el.log.scrollHeight;
    });
  }

  function autoGrow() {
    el.input.style.height = 'auto';
    el.input.style.height = `${Math.min(el.input.scrollHeight, 96)}px`;
    scrollToLatest();
  }

  function updateComposer() {
    const length = el.input.value.trim().length;
    el.send.disabled = state.busy || length === 0;
    if (el.count) {
      el.count.textContent = length > MAX_LENGTH * 0.9 ? `${length}/${MAX_LENGTH}` : '';
      el.count.classList.toggle('is-visible', length > MAX_LENGTH * 0.9);
    }
  }

  /* ----------------------------------------------------------- messages */

  function addMessage(role, text, options = {}) {
    const isUser = role === 'user';
    const wrapper = createElement('article', `ai-msg ${isUser ? 'ai-msg--user' : 'ai-msg--ai'}`);
    if (options.error) wrapper.classList.add('ai-msg--error');

    // Only the assistant is named. A visitor does not need their own messages
    // labelled "You" - the right-aligned bubble already says who is speaking,
    // and the repeated label just made the log harder to scan.
    if (!isUser) {
      const name = createElement('p', 'ai-name');
      name.append(iconElement('sparkle'));
      name.append(document.createTextNode('Prajwal AI'));
      wrapper.append(name);
    }

    const bubble = createElement('div', 'ai-bubble');
    const rich = createElement('div', 'ai-rich');
    renderMarkdown(rich, text);
    bubble.append(rich);
    wrapper.append(bubble);

    if (options.retry) {
      const retry = createElement('button', 'ai-retry', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', () => {
        wrapper.remove();
        ask(options.retry, { replace: true });
      });
      wrapper.append(retry);
    }

    el.log.append(wrapper);
    scrollToLatest();
    return wrapper;
  }

  function showTyping() {
    const wrapper = createElement('article', 'ai-msg ai-msg--ai ai-msg--typing');
    const bubble = createElement('div', 'ai-bubble');
    const dots = createElement('span', 'ai-typing');
    dots.setAttribute('role', 'status');
    dots.setAttribute('aria-label', 'Prajwal AI is typing');
    dots.append(createElement('span'), createElement('span'), createElement('span'));
    bubble.append(dots);
    wrapper.append(bubble);
    el.log.append(wrapper);
    scrollToLatest();
    return wrapper;
  }

  function setBusy(busy) {
    state.busy = busy;
    root.classList.toggle('is-busy', busy);
    if (el.status) el.status.textContent = busy ? 'Typing' : 'Online';
    updateComposer();
  }

  /* -------------------------------------------------------------- open */

  function focusables() {
    return [...el.panel.querySelectorAll('button, textarea, [href], input, select, [tabindex]:not([tabindex="-1"])')].filter(
      node => !node.disabled && node.offsetParent !== null
    );
  }

  // Older browsers have no AbortSignal.timeout; the request simply runs
  // without a client-side timeout there.
  function requestSignal() {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    }
    return undefined;
  }

  function openPanel() {
    if (state.open) return;
    state.open = true;
    el.panel.hidden = false;
    root.classList.add('is-open');
    el.toggle.setAttribute('aria-expanded', 'true');
    el.toggle.setAttribute('aria-label', 'Close Prajwal AI assistant');
    scrollToLatest();
    // On touch devices the log is focused instead of the textarea, so the
    // on-screen keyboard does not cover the conversation on open.
    window.setTimeout(() => {
      (touchDevice.matches ? el.log : el.input).focus({ preventScroll: true });
    }, reduceMotion.matches ? 0 : 220);
  }

  function closePanel({ restoreFocus = true } = {}) {
    if (!state.open) return;
    state.open = false;
    el.panel.hidden = true;
    root.classList.remove('is-open');
    el.toggle.setAttribute('aria-expanded', 'false');
    el.toggle.setAttribute('aria-label', 'Open Prajwal AI assistant');
    el.input.blur();
    if (restoreFocus) el.toggle.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------- send */

  async function ask(text, { replace = false } = {}) {
    if (state.busy) return;

    const message = String(text || '').trim();
    if (!message) return;
    if (message.length > MAX_LENGTH) {
      addMessage('ai', TOO_LONG_ERROR, { error: true });
      return;
    }

    const history = replace ? state.messages.slice(0, -1) : state.messages.slice();
    if (replace) {
      // A retry replaces the failed turn instead of repeating it.
      state.messages = history;
    }

    state.messages.push({ role: 'user', text: message });
    // Only the recent turns are kept, which is all the model is ever sent.
    if (state.messages.length > HISTORY_LIMIT + 2) {
      state.messages = state.messages.slice(-(HISTORY_LIMIT + 2));
    }
    addMessage('user', message);
    el.input.value = '';
    autoGrow();
    setBusy(true);

    const typing = showTyping();

    try {
      const response = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ message, history: history.slice(-HISTORY_LIMIT) }),
        signal: requestSignal(),
      });

      if (response.status === 429) {
        typing.remove();
        addMessage('ai', RATE_LIMIT_ERROR, { error: true, retry: message });
        return;
      }

      // The daily Gemini quota is reported as 503 with an "ai-rate-limited"
      // code, which is easy to mistake for the server being down. Read the code
      // so the visitor is told the truth instead of a connection error.
      if (response.status === 503) {
        let code = '';
        try {
          const body = await response.json();
          code = body?.error?.code || '';
        } catch {
          // A non-JSON 503 is treated as a plain server problem below.
        }
        typing.remove();
        if (code === 'ai-rate-limited') {
          addMessage('ai', QUOTA_ERROR, { error: true });
          return;
        }
        addMessage('ai', GENERIC_ERROR, { error: true, retry: message });
        return;
      }

      if (!response.ok) throw new Error(`chat request failed with status ${response.status}`);

      const payload = await response.json();
      const reply = typeof payload?.reply === 'string' ? payload.reply.trim() : '';
      if (!reply) throw new Error('chat response did not include a reply');

      typing.remove();
      state.messages.push({ role: 'model', text: reply });
      addMessage('ai', reply);
    } catch (error) {
      typing.remove();
      // The raw reason is kept out of the conversation on purpose: visitors
      // only ever see the friendly line.
      console.warn('[chat] Prajwal AI could not reply:', error && error.message ? error.message : error);
      addMessage('ai', GENERIC_ERROR, { error: true, retry: message });
    } finally {
      setBusy(false);
      // On a phone the keyboard is left exactly where the visitor put it.
      if (!touchDevice.matches) el.input.focus({ preventScroll: true });
    }
  }

  /* ------------------------------------------------------------- jump */

  function jumpToSection(id) {
    const target = document.getElementById(id);
    closePanel({ restoreFocus: false });
    if (!target) return;
    target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    // Keyboard users continue from the section they jumped to.
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------- wire */

  el.toggle.addEventListener('click', () => (state.open ? closePanel() : openPanel()));
  el.minimize.addEventListener('click', () => closePanel());
  el.close.addEventListener('click', () => closePanel());

  root.querySelectorAll('[data-ai-question]').forEach(chip => {
    chip.addEventListener('click', () => ask(chip.dataset.aiQuestion));
  });

  root.querySelectorAll('[data-ai-jump]').forEach(button => {
    button.addEventListener('click', () => jumpToSection(button.dataset.aiJump));
  });

  el.form.addEventListener('submit', event => {
    event.preventDefault();
    ask(el.input.value);
  });

  el.input.addEventListener('input', () => {
    autoGrow();
    updateComposer();
  });

  el.input.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // `isComposing` keeps IME and mobile keyboard suggestions from sending a
    // half-typed word.
    if (event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (el.input.value.trim()) ask(el.input.value);
  });

  el.panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closePanel();
      return;
    }
    if (event.key !== 'Tab') return;
    // The panel is a dialog, so Tab stays inside it while it is open.
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  /* -------------------------------------------------- mobile keyboard */

  // visualViewport shrinks when the keyboard opens. Feeding those numbers into
  // CSS keeps the composer above the keyboard and the window inside the
  // viewport on iOS, Android and desktop.
  const viewport = window.visualViewport;
  if (viewport) {
    const syncViewport = () => {
      root.style.setProperty('--ai-vh', `${viewport.height}px`);
      root.style.setProperty('--ai-vb', `${Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop))}px`);
      scrollToLatest();
    };
    viewport.addEventListener('resize', syncViewport);
    viewport.addEventListener('scroll', syncViewport);
    syncViewport();
  }

  window.addEventListener('resize', () => {
    if (el.input.value) autoGrow();
  });

  // Another control opening (the mobile nav, a modal) should not fight the
  // assistant for attention.
  document.addEventListener('click', event => {
    if (!state.open) return;
    if (root.contains(event.target)) return;
    if (event.target.closest('.nav-links, .menu-toggle, .modal')) closePanel({ restoreFocus: false });
  });

  /* ------------------------------------------------------------- init */

  addMessage('ai', WELCOME_MESSAGE);
  updateComposer();
})();
