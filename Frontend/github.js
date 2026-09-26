/**
 * GitHub Activity dashboard.
 *
 * Requests the latest verified data from the backend at GET /api/github and
 * renders it. The server owns the GitHub credentials; this file never sees a
 * token. Nothing here invents values: when a number or a chart is missing it
 * is shown as unavailable rather than filled in.
 */

(() => {
  const section = document.querySelector('[data-github-activity]');
  if (!section) return;

  const isLocal = window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const apiBase = window.PORTFOLIO_API_URL || (isLocal ? 'http://127.0.0.1:3000/api' : `${window.location.origin}/api`);

  const el = {
    section,
    status: section.querySelector('[data-gh-status]'),
    skeleton: section.querySelector('[data-gh-skeleton]'),
    error: section.querySelector('[data-gh-error]'),
    errorMessage: section.querySelector('[data-gh-error-message]'),
    retry: section.querySelector('[data-gh-retry]'),
    dashboard: section.querySelector('[data-gh-dashboard]'),
    avatar: section.querySelector('[data-gh-avatar]'),
    name: section.querySelector('[data-gh-name]'),
    handle: section.querySelector('[data-gh-handle]'),
    freshness: section.querySelector('[data-gh-freshness]'),
    liveDot: section.querySelector('[data-gh-live-dot]'),
    chart: section.querySelector('[data-gh-chart]'),
    chartNote: section.querySelector('[data-gh-chart-note]'),
    chartFoot: section.querySelector('[data-gh-chart-foot]'),
    calendar: section.querySelector('[data-gh-calendar]'),
    calendarHint: section.querySelector('[data-gh-calendar-hint]'),
    contributionsUnavailable: section.querySelector('[data-gh-contributions-unavailable]'),
    contributionsNotice: section.querySelector('[data-gh-contributions-notice]'),
    repos: section.querySelector('[data-gh-repos]'),
    reposEmpty: section.querySelector('[data-gh-repos-empty]'),
    reposNote: section.querySelector('[data-gh-repos-note]'),
    profileLink: section.querySelector('[data-gh-profile-link]'),
    reposLink: section.querySelector('[data-gh-repos-link]'),
  };

  let tooltip = null;
  let activeCell = null;
  let refreshTimer = null;
  let latest = null;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const numberFormat = new Intl.NumberFormat();

  // GitHub's own linguist colours, with a green fallback.
  const LANGUAGE_COLORS = {
    JavaScript: '#f1e05a',
    TypeScript: '#3178c6',
    Python: '#3572A5',
    HTML: '#e34c26',
    CSS: '#663399',
    Java: '#b07219',
    'C++': '#f34b7d',
    C: '#8b949e',
    'C#': '#178600',
    PHP: '#4F5D95',
    Ruby: '#701516',
    Go: '#00ADD8',
    Rust: '#dea584',
    Shell: '#89e051',
    Swift: '#F05138',
    Kotlin: '#A97BFF',
    Dart: '#00B4AB',
    Jupyter: '#DA5B0B',
  };

  const CONTRIBUTION_UNAVAILABLE_COPY = {
    'missing-token':
      'The server has no GitHub token configured, and GitHub only shares contribution history with authenticated requests. Nothing is shown rather than an estimate.',
    'invalid-token': 'The server GitHub token was rejected by GitHub, so contribution history could not be read.',
    'rate-limited': 'The GitHub API rate limit was reached, so contribution history is temporarily unavailable.',
    'user-not-found': 'GitHub could not find an account matching the configured username.',
  };

  /* ---------------------------------------------------------------- utils */

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function iconElement(name) {
    const node = document.createElement('i');
    node.setAttribute('data-lucide', name);
    return node;
  }

  function refreshIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  function escapeAttribute(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatDate(iso) {
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(iso);
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatRelative(value) {
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return null;
    const minutes = Math.round((Date.now() - then) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    if (days < 31) return `${days} day${days === 1 ? '' : 's'} ago`;
    return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function countUp(node, target) {
    if (reduceMotion.matches || target === 0) {
      node.textContent = numberFormat.format(target);
      return;
    }
    const duration = 900;
    const start = performance.now();
    const step = now => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      node.textContent = numberFormat.format(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function setStat(key, value) {
    const node = section.querySelector(`[data-gh-stat="${key}"]`);
    if (!node) return;
    if (value === null || value === undefined || Number.isNaN(value)) {
      node.textContent = '—';
      node.classList.add('is-unavailable');
      node.setAttribute('title', 'Not reported by the GitHub API');
      return;
    }
    node.classList.remove('is-unavailable');
    node.removeAttribute('title');
    countUp(node, value);
  }

  /* --------------------------------------------------------------- states */

  function showState(name, message) {
    el.skeleton.hidden = name !== 'loading';
    el.error.hidden = name !== 'error';
    el.dashboard.hidden = name !== 'ready';
    el.status.textContent = message || '';
    el.status.classList.toggle('is-error', name === 'error');
    el.section.setAttribute('aria-busy', name === 'loading' ? 'true' : 'false');
  }

  /* ---------------------------------------------------------------- chart */

  function buildMonthlySeries(weeks) {
    if (!Array.isArray(weeks) || !weeks.length) return [];
    const buckets = new Map();
    weeks.forEach(week => {
      (week.days || []).forEach(day => {
        const month = String(day.date).slice(0, 7);
        buckets.set(month, (buckets.get(month) || 0) + (Number(day.count) || 0));
      });
    });
    return [...buckets.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-12)
      .map(([month, total]) => {
        const [year, monthNumber] = month.split('-').map(Number);
        const date = new Date(year, monthNumber - 1, 1);
        return {
          total,
          label: date.toLocaleDateString(undefined, { month: 'short' }),
          fullLabel: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        };
      });
  }

  function renderChart(contributions) {
    el.chart.replaceChildren();
    const series = buildMonthlySeries(contributions?.weeks);

    if (!series.length) {
      el.chartNote.textContent = 'Contribution data unavailable';
      el.chartFoot.textContent = '';
      el.chart.append(createElement('p', 'gh-chart-empty', 'No monthly activity to plot yet.'));
      return;
    }

    const width = 480;
    const height = 240;
    const padding = { top: 16, right: 12, bottom: 30, left: 34 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const max = Math.max(...series.map(point => point.total), 1);
    const step = series.length > 1 ? plotWidth / (series.length - 1) : 0;

    const points = series.map((point, index) => ({
      ...point,
      x: padding.left + (series.length > 1 ? index * step : plotWidth / 2),
      y: padding.top + plotHeight - (point.total / max) * plotHeight,
    }));

    let grid = '';
    for (let index = 0; index <= 4; index += 1) {
      const y = padding.top + (plotHeight / 4) * index;
      const value = Math.round(max - (max / 4) * index);
      grid += `<line class="gh-chart-grid" x1="${padding.left}" y1="${y.toFixed(1)}" x2="${width - padding.right}" y2="${y.toFixed(1)}" />`;
      grid += `<text class="gh-chart-axis" x="${padding.left - 9}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${value}</text>`;
    }

    const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    const baseline = padding.top + plotHeight;
    const area = `${line} L${points[points.length - 1].x.toFixed(1)} ${baseline} L${points[0].x.toFixed(1)} ${baseline} Z`;

    const barWidth = Math.max(series.length > 1 ? step / 2.8 : 28, 5);
    const bars = points
      .map(point => {
        const barHeight = point.total > 0 ? Math.max((point.total / max) * plotHeight, 3) : 0;
        const x = point.x - barWidth / 2;
        const y = baseline - barHeight;
        return `<rect class="gh-chart-bar" data-index="${points.indexOf(point)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3" />`;
      })
      .join('');

    const labels = points
      .map(point => `<text class="gh-chart-label" x="${point.x.toFixed(1)}" y="${height - 10}" text-anchor="middle">${point.label}</text>`)
      .join('');

    const dots = points
      .map(point => `<circle class="gh-chart-dot" data-index="${points.indexOf(point)}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.5" />`)
      .join('');

    el.chart.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttribute(
        `Contributions per month over the last ${series.length} months`
      )}">
        <defs>
          <linearGradient id="ghBarFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--gh-accent-bright)" stop-opacity="0.78" />
            <stop offset="52%" stop-color="var(--gh-accent)" stop-opacity="0.56" />
            <stop offset="100%" stop-color="var(--gh-accent-deep)" stop-opacity="0.42" />
          </linearGradient>
          <linearGradient id="ghChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--gh-accent)" stop-opacity="0.42" />
            <stop offset="55%" stop-color="var(--mint)" stop-opacity="0.22" />
            <stop offset="100%" stop-color="var(--mint)" stop-opacity="0" />
          </linearGradient>
        </defs>
        ${grid}
        <path class="gh-chart-area" d="${area}" />
        <g class="gh-chart-bars">${bars}</g>
        <path class="gh-chart-line" pathLength="1" d="${line}" />
        <g class="gh-chart-dots">${dots}</g>
        <g class="gh-chart-labels">${labels}</g>
      </svg>
      <div class="gh-chart-hover" data-gh-chart-hover hidden></div>`;

    el.chartNote.textContent = `Contributions per month · last ${series.length} months`;
    const busiest = series.reduce((best, point) => (point.total > best.total ? point : best), series[0]);
    el.chartFoot.textContent = `Busiest month: ${busiest.fullLabel} — ${numberFormat.format(busiest.total)} contributions.`;

    const hoverBox = el.chart.querySelector('[data-gh-chart-hover]');
    const svg = el.chart.querySelector('svg');

    const activate = index => {
      const point = points[index];
      if (!point) return;
      svg.querySelectorAll('.is-active').forEach(node => node.classList.remove('is-active'));
      svg.querySelectorAll(`[data-index="${index}"]`).forEach(node => node.classList.add('is-active'));
      hoverBox.textContent = `${point.fullLabel} · ${numberFormat.format(point.total)} contributions`;
      hoverBox.hidden = false;
      hoverBox.style.left = `${((point.x / width) * 100).toFixed(2)}%`;
    };
    const deactivate = () => {
      svg.querySelectorAll('.is-active').forEach(node => node.classList.remove('is-active'));
      hoverBox.hidden = true;
    };

    svg.querySelectorAll('[data-index]').forEach(node => {
      const index = Number(node.dataset.index);
      node.addEventListener('mouseenter', () => activate(index));
    });
    svg.addEventListener('mouseleave', deactivate);
  }

  /* ------------------------------------------------------------- calendar */

  function getTooltip() {
    if (!tooltip) {
      tooltip = createElement('div', 'gh-tooltip');
      tooltip.setAttribute('aria-hidden', 'true');
      section.append(tooltip);
    }
    return tooltip;
  }

  function showTooltip(target, text) {
    const node = getTooltip();
    node.textContent = text;
    node.classList.add('is-visible');
    const targetRect = target.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const centred = targetRect.left - sectionRect.left + targetRect.width / 2 - nodeRect.width / 2;
    const left = Math.max(4, Math.min(centred, section.clientWidth - nodeRect.width - 4));
    const above = targetRect.top - sectionRect.top - nodeRect.height - 10;
    const top = above > 0 ? above : targetRect.bottom - sectionRect.top + 10;
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  }

  function hideTooltip() {
    if (tooltip) tooltip.classList.remove('is-visible');
  }

  function describeCell(cell) {
    const count = Number(cell.dataset.count) || 0;
    return `${count} contribution${count === 1 ? '' : 's'} on ${formatDate(cell.dataset.date)}`;
  }

  function weekdayOf(iso) {
    const date = new Date(`${iso}T00:00:00`);
    return Number.isNaN(date.getTime()) ? 0 : date.getDay();
  }

  function renderCalendar(contributions) {
    el.calendar.replaceChildren();
    const weeks = Array.isArray(contributions?.weeks) ? contributions.weeks.filter(week => week?.days?.length) : [];
    if (!weeks.length) return;

    // Weeks at the edges of the range can be partial, so every cell is placed
    // by its real weekday instead of relying on a fixed seven-day column.
    const cells = [];
    const lookup = new Map();
    const fragment = document.createDocumentFragment();

    weeks.forEach((week, weekIndex) => {
      const row = createElement('div', 'gh-cal-row');
      row.setAttribute('role', 'row');
      week.days.forEach(day => {
        const weekday = weekdayOf(day.date);
        const cell = createElement('span', 'gh-cell');
        cell.setAttribute('role', 'gridcell');
        cell.dataset.level = String(Math.min(Math.max(Number(day.level) || 0, 0), 4));
        cell.dataset.count = String(Number(day.count) || 0);
        cell.dataset.date = String(day.date);
        cell.style.gridArea = `${weekday + 1} / ${weekIndex + 1}`;
        cell.tabIndex = -1;
        cell.setAttribute('aria-label', describeCell(cell));
        row.append(cell);
        cells.push(cell);
        lookup.set(`${weekIndex}:${weekday}`, cell);
      });
      fragment.append(row);
    });

    el.calendar.append(fragment);
    el.calendar.style.setProperty('--gh-weeks', String(weeks.length));

    // Roving tabindex: one cell is reachable by Tab, arrows move within the grid.
    const last = cells[cells.length - 1];
    last.tabIndex = 0;
    activeCell = last;

    el.calendar.addEventListener('mouseover', event => {
      const cell = event.target.closest('.gh-cell');
      if (cell) showTooltip(cell, describeCell(cell));
    });
    el.calendar.addEventListener('mouseleave', hideTooltip);
    el.calendar.addEventListener('focusin', event => {
      const cell = event.target.closest('.gh-cell');
      if (cell) showTooltip(cell, describeCell(cell));
    });
    el.calendar.addEventListener('focusout', hideTooltip);
    el.calendar.addEventListener('keydown', event => {
      const cell = event.target.closest('.gh-cell');
      if (!cell) return;

      const column = Number(cell.style.gridColumnStart) - 1;
      const row = Number(cell.style.gridRowStart) - 1;
      const moves = {
        ArrowLeft: [column - 1, row],
        ArrowRight: [column + 1, row],
        ArrowUp: [column, row - 1],
        ArrowDown: [column, row + 1],
      };

      let next;
      if (event.key === 'Home') next = lookup.get(`0:${row}`);
      else if (event.key === 'End') next = lookup.get(`${weeks.length - 1}:${row}`);
      else if (event.key in moves) next = lookup.get(moves[event.key].join(':'));
      if (!next) return;

      event.preventDefault();
      activeCell.tabIndex = -1;
      next.tabIndex = 0;
      next.focus();
      activeCell = next;
    });
  }

  /* ---------------------------------------------------------------- repos */

  function metric(iconName, text) {
    const node = createElement('span', 'gh-repo-metric');
    node.append(iconElement(iconName), createElement('span', null, text));
    return node;
  }

  function renderRepositories(repositories, totalsComplete) {
    el.repos.replaceChildren();
    const list = Array.isArray(repositories) ? repositories.filter(repository => repository && repository.url) : [];

    if (!list.length) {
      el.reposEmpty.hidden = false;
      el.reposNote.textContent = '';
      return;
    }

    const sorted = [...list].sort((a, b) => {
      const archived = Number(Boolean(a.isArchived)) - Number(Boolean(b.isArchived));
      if (archived !== 0) return archived;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
    const visible = sorted.slice(0, 6);

    el.reposEmpty.hidden = true;
    el.reposNote.textContent = `Showing ${visible.length} of ${list.length} public repos${totalsComplete ? '' : ' (partial list)'}`;

    const fragment = document.createDocumentFragment();
    visible.forEach(repository => {
      const link = createElement('a', 'gh-repo-link');
      link.href = repository.url;
      link.target = '_blank';
      link.rel = 'noreferrer';

      const top = createElement('div', 'gh-repo-top');
      top.append(createElement('span', 'gh-repo-name', repository.name));
      if (repository.isFork) top.append(createElement('span', 'gh-repo-badge', 'fork'));
      if (repository.isArchived) top.append(createElement('span', 'gh-repo-badge', 'archived'));
      top.append(iconElement('arrow-up-right'));

      const description = createElement('p', 'gh-repo-desc', repository.description || 'No description provided.');

      const meta = createElement('div', 'gh-repo-meta');
      if (repository.language) {
        const language = createElement('span', 'gh-repo-metric gh-repo-language');
        const dot = createElement('i', 'gh-repo-dot');
        dot.style.background = LANGUAGE_COLORS[repository.language] || 'var(--gh-accent)';
        language.append(dot, createElement('span', null, repository.language));
        meta.append(language);
      }
      meta.append(metric('star', numberFormat.format(repository.stars || 0)));
      meta.append(metric('git-fork', numberFormat.format(repository.forks || 0)));
      if (repository.updatedAt) meta.append(createElement('span', 'gh-repo-metric gh-repo-updated', `Updated ${formatRelative(repository.updatedAt)}`));

      link.append(top, description, meta);

      const item = createElement('li', 'gh-repo');
      item.append(link);
      fragment.append(item);
    });

    el.repos.append(fragment);
  }

  /* ----------------------------------------------------------------- main */

  function renderContributions(data) {
    const contributions = data.contributions || null;

    if (!contributions) {
      el.contributionsUnavailable.hidden = false;
      el.calendarHint.hidden = true;
      el.contributionsNotice.textContent =
        CONTRIBUTION_UNAVAILABLE_COPY[data.contributionsUnavailableReason] ||
        'GitHub did not return contribution history for this account, so nothing is displayed here.';
      el.chart.replaceChildren(createElement('p', 'gh-chart-empty', 'Activity graph unavailable for this period.'));
      el.chartNote.textContent = 'Contribution data unavailable';
      el.chartFoot.textContent = '';
      el.calendar.replaceChildren();
      return;
    }

    el.contributionsUnavailable.hidden = true;
    el.calendarHint.hidden = false;
    renderChart(contributions);
    renderCalendar(contributions);
  }

  function render(data) {
    const profile = data.profile || {};
    const stats = data.stats || {};
    const meta = data.meta || {};

    if (profile.avatarUrl) {
      const image = createElement('img');
      image.src = profile.avatarUrl;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.width = 52;
      image.height = 52;
      el.avatar.replaceChildren(image);
    }

    el.name.textContent = profile.name || profile.username || 'GitHub';
    el.handle.textContent = profile.location ? `@${profile.username} · ${profile.location}` : `@${profile.username || ''}`;
    if (profile.bio) el.handle.title = profile.bio;

    if (profile.profileUrl) el.profileLink.href = profile.profileUrl;
    // `visibility=public` is required: without it GitHub lists the account
    // owner's private repositories too, which must never be linked from here.
    if (profile.username) el.reposLink.href = `https://github.com/${encodeURIComponent(profile.username)}?tab=repositories&visibility=public&sort=stargazers`;

    setStat('contributions', data.contributions ? data.contributions.totalLastYear : null);
    setStat('publicRepos', stats.publicRepos ?? null);
    setStat('totalStars', stats.totalStars ?? null);
    setStat('totalForks', stats.totalForks ?? null);
    setStat('followers', stats.followers ?? null);

    renderContributions(data);
    renderRepositories(data.repositories, stats.totalsComplete !== false);

    if (meta.stale) {
      // Only claim GitHub is unreachable when an upstream call actually
      // failed. A merely expired cache is being revalidated in the background.
      el.liveDot.classList.add('is-stale');
      el.freshness.textContent = meta.upstreamError
        ? `Last verified ${formatRelative(meta.fetchedAt) || 'earlier'} · GitHub unreachable`
        : `Last verified ${formatRelative(meta.fetchedAt) || 'earlier'} · refreshing`;
    } else {
      el.liveDot.classList.remove('is-stale');
      el.freshness.textContent = `Updated ${formatRelative(meta.fetchedAt) || 'just now'}`;
    }
    if (meta.fetchedAt) el.freshness.title = `Fetched from GitHub at ${new Date(meta.fetchedAt).toLocaleString()}`;

    showState('ready', '');
    el.section.classList.add('is-ready');
    refreshIcons();
  }

  function renderFailure(message) {
    showState('error', 'GitHub data is unavailable right now.');
    el.errorMessage.textContent = `${message} No values are being estimated in its place.`;
    el.section.classList.remove('is-ready');
    refreshIcons();
  }

  function scheduleRefresh() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    const ttl = Number(latest?.meta?.cacheTtlSeconds) || 600;
    // Re-check just after the server cache expires so new GitHub activity
    // appears without hammering the API on every page load.
    refreshTimer = window.setInterval(() => {
      if (!document.hidden) load();
    }, (ttl + 60) * 1000);
  }

  async function load() {
    showState('loading', latest ? 'Refreshing GitHub data…' : 'Loading live GitHub data…');
    el.errorMessage.textContent = 'We could not reach the GitHub API just now. Nothing is being estimated in its place.';

    let response;
    try {
      response = await fetch(`${apiBase}/github`, { headers: { Accept: 'application/json' } });
    } catch {
      renderFailure('The portfolio API could not be reached.');
      return;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      renderFailure('The GitHub API returned an unreadable response.');
      return;
    }

    if (!response.ok || !payload || payload.ok === false) {
      renderFailure(payload?.error?.message || `The GitHub API responded with status ${response.status}.`);
      return;
    }

    latest = payload;
    try {
      render(payload);
    } catch (error) {
      renderFailure('The GitHub data could not be displayed.');
      console.error('GitHub dashboard render failed:', error);
      return;
    }
    scheduleRefresh();
  }

  el.retry.addEventListener('click', () => load());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !latest?.meta?.fetchedAt) return;
    const ageSeconds = (Date.now() - new Date(latest.meta.fetchedAt).getTime()) / 1000;
    if (ageSeconds > (latest.meta.cacheTtlSeconds || 600) + 60) load();
  });

  load();
})();
