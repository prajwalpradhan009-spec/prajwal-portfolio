/**
 * Live GitHub data for the portfolio.
 *
 * Every number this module returns comes from GitHub's own APIs. Nothing is
 * hard-coded, estimated or filled in with placeholders: if GitHub cannot be
 * reached, the request fails loudly, and if only part of the data is
 * available the response says so instead of guessing.
 *
 * Credentials are read from process.env (populated by dotenv locally and by
 * Render environment variables in production) and are never returned to the
 * client.
 */

const REST_ENDPOINT = 'https://api.github.com';
const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
const API_VERSION = '2022-11-28';

const DEFAULT_CACHE_MINUTES = 10;
const MIN_CACHE_MINUTES = 1;
const MAX_CACHE_MINUTES = 60;

// Stale data is only served (clearly flagged) when GitHub is temporarily
// unreachable and we already hold a previously verified response.
const MAX_STALE_MINUTES = 360;

const REQUEST_TIMEOUT_MS = 12000;
const REPOS_PER_PAGE = 100;
const MAX_REPO_PAGES = 10; // 1000 public repos, far beyond a portfolio profile.

const cache = {
  key: null,
  payload: null,
  storedAt: 0,
  expiresAt: 0,
};
let inFlightRequest = null;

class GitHubError extends Error {
  constructor(code, message, status = 502, details = {}) {
    super(message);
    this.name = 'GitHubError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function readConfig() {
  const username = String(process.env.GITHUB_USERNAME || '').trim();
  const token = String(process.env.GITHUB_TOKEN || '').trim();
  const requestedCache = Number(process.env.GITHUB_CACHE_MINUTES);
  const cacheMinutes = Number.isFinite(requestedCache)
    ? Math.min(Math.max(requestedCache, MIN_CACHE_MINUTES), MAX_CACHE_MINUTES)
    : DEFAULT_CACHE_MINUTES;

  return { username, token, cacheMinutes };
}

function buildHeaders({ token, accept = 'application/vnd.github+json' } = {}) {
  const headers = {
    Accept: accept,
    'User-Agent': 'prajwal-portfolio-api',
    'X-GitHub-Api-Version': API_VERSION,
  };
  // The token only ever travels from this process to api.github.com.
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function isRateLimited(response) {
  if (response.status !== 403 && response.status !== 429) return false;
  const remaining = response.headers.get('x-ratelimit-remaining');
  return remaining === '0' || response.headers.get('retry-after') !== null;
}

function rateLimitResetIso(response) {
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  if (!Number.isFinite(reset) || reset <= 0) return null;
  return new Date(reset * 1000).toISOString();
}

async function readErrorMessage(response) {
  try {
    const body = await response.json();
    if (body && typeof body.message === 'string') return body.message;
  } catch {
    // GitHub occasionally returns an empty or non-JSON error body.
  }
  return null;
}

async function githubFetch(url, options, token) {
  if (typeof fetch !== 'function') {
    throw new GitHubError('unsupported-runtime', 'This server needs Node.js 18 or newer to reach the GitHub API.', 500);
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: buildHeaders({ token, accept: options?.accept }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new GitHubError(
      timedOut ? 'upstream-timeout' : 'upstream-unreachable',
      timedOut ? 'GitHub took too long to respond.' : 'Could not reach the GitHub API.',
      504
    );
  }

  if (response.ok) return response;

  if (isRateLimited(response)) {
    throw new GitHubError('rate-limited', 'GitHub API rate limit reached. Try again shortly.', 503, {
      retryAfter: response.headers.get('retry-after'),
      rateLimitResetAt: rateLimitResetIso(response),
    });
  }
  if (response.status === 401) {
    throw new GitHubError('invalid-token', 'The configured GITHUB_TOKEN was rejected by GitHub.', 500);
  }
  if (response.status === 404) {
    throw new GitHubError('user-not-found', 'That GitHub account could not be found.', 404);
  }

  throw new GitHubError('upstream-error', (await readErrorMessage(response)) || `GitHub responded with ${response.status}.`, 502, {
    status: response.status,
  });
}

async function fetchProfile(username, token) {
  const response = await githubFetch(`${REST_ENDPOINT}/users/${encodeURIComponent(username)}`, {}, token);
  const user = await response.json();
  return {
    username: user.login,
    name: user.name || null,
    avatarUrl: user.avatar_url || null,
    profileUrl: user.html_url,
    bio: user.bio || null,
    location: user.location || null,
    createdAt: user.created_at || null,
    // Public follower / following counts are exposed on the public profile.
    followers: Number.isFinite(Number(user.followers)) ? Number(user.followers) : null,
    following: Number.isFinite(Number(user.following)) ? Number(user.following) : null,
  };
}

async function fetchAllRepos(username, token) {
  const repositories = [];

  for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
    const url = `${REST_ENDPOINT}/users/${encodeURIComponent(username)}/repos?per_page=${REPOS_PER_PAGE}&page=${page}&sort=pushed&type=owner`;
    const response = await githubFetch(url, {}, token);
    const batch = await response.json();
    if (!Array.isArray(batch)) break;

    // This endpoint is public, so private repositories must never leave the
    // server. A token carrying the `repo` scope can list them, so they are
    // dropped before anything is mapped or counted.
    const publicBatch = batch.filter(repository => !repository.private);

    repositories.push(
      ...publicBatch.map(repository => ({
        name: repository.name,
        description: repository.description || null,
        url: repository.html_url,
        language: repository.language || null,
        stars: Number(repository.stargazers_count) || 0,
        forks: Number(repository.forks_count) || 0,
        topics: Array.isArray(repository.topics) ? repository.topics.slice(0, 5) : [],
        isFork: Boolean(repository.fork),
        isArchived: Boolean(repository.archived),
        updatedAt: repository.pushed_at || repository.updated_at || null,
      }))
    );

    if (batch.length < REPOS_PER_PAGE) return { repositories, totalsComplete: true };
  }

  return { repositories, totalsComplete: false };
}

const CONTRIBUTIONS_QUERY = `
  query PortfolioContributions($login: String!, $from: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from) {
        contributionCalendar {
          totalContributions
          weeks {
            firstDay
            contributionDays {
              contributionCount
              contributionLevel
              date
            }
          }
        }
        restrictedContributionsCount
      }
    }
  }
`;

function contributionLevelToNumber(level) {
  if (typeof level === 'number') return Math.min(Math.max(level, 0), 4);
  return { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, QUARTILE: 4 }[level] ?? 0;
}

function summariseWeeks(weeks) {
  const days = [];
  let total = 0;
  let activeDays = 0;
  let currentStreak = 0;
  let longestStreak = 0;
  let runningStreak = 0;

  weeks.forEach(week => {
    week.contributionDays.forEach(day => {
      const count = Number(day.contributionCount) || 0;
      days.push({ date: day.date, count, level: contributionLevelToNumber(day.contributionLevel) });
      total += count;
      if (count > 0) {
        activeDays += 1;
        runningStreak += 1;
        longestStreak = Math.max(longestStreak, runningStreak);
      } else {
        runningStreak = 0;
      }
    });
  });

  // A streak is still "current" if today or yesterday was an active day.
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const last = days[days.length - 1];
  if (last && (last.date === today || last.date === yesterday)) currentStreak = runningStreak;

  const from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const totalLast30Days = days.filter(day => day.date >= from).reduce((sum, day) => sum + day.count, 0);
  const totalLast7Days = days.filter(day => day.date >= weekAgo).reduce((sum, day) => sum + day.count, 0);

  return {
    totalLastYear: total,
    totalLast30Days,
    totalLast7Days,
    activeDays,
    currentStreak,
    longestStreak,
    weeks: weeks.map(week => ({
      start: week.firstDay,
      days: week.contributionDays.map(day => ({
        date: day.date,
        count: Number(day.contributionCount) || 0,
        level: contributionLevelToNumber(day.contributionLevel),
      })),
    })),
  };
}

/**
 * Contribution history comes from GitHub's official GraphQL API, which is the
 * only supported way to read it. It requires authentication, so without a
 * token this reports "unavailable" rather than inventing numbers.
 */
async function fetchContributions(username, token) {
  if (!token) {
    return {
      contributions: null,
      contributionsUnavailableReason: 'missing-token',
      contributionsNotice: 'Add GITHUB_TOKEN on the server to load the contribution calendar.',
    };
  }

  const from = new Date(Date.now() - 364 * 86400000).toISOString();

  let body;
  try {
    const response = await githubFetch(
      GRAPHQL_ENDPOINT,
      {
        method: 'POST',
        accept: 'application/json',
        body: JSON.stringify({ query: CONTRIBUTIONS_QUERY, variables: { login: username, from } }),
      },
      token
    );
    body = await response.json();
  } catch (error) {
    const code = error.code === 'rate-limited' ? 'rate-limited' : error.code === 'invalid-token' ? 'invalid-token' : 'contributions-unavailable';
    return { contributions: null, contributionsUnavailableReason: code, contributionsNotice: error.message };
  }

  if (body?.errors?.length) {
    const type = body.errors[0]?.type;
    const reason = type === 'NOT_FOUND' ? 'user-not-found' : type === 'RATE_LIMITED' ? 'rate-limited' : 'contributions-unavailable';
    return { contributions: null, contributionsUnavailableReason: reason, contributionsNotice: body.errors[0]?.message || null };
  }

  const calendar = body?.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar?.weeks?.length) {
    return {
      contributions: null,
      contributionsUnavailableReason: 'contributions-unavailable',
      contributionsNotice: 'GitHub returned no contribution history for this account.',
    };
  }

  const summary = summariseWeeks(calendar.weeks);
  return {
    contributions: {
      ...summary,
      totalLastYear: Number(calendar.totalContributions) || summary.totalLastYear,
    },
    contributionsUnavailableReason: null,
    contributionsNotice: null,
  };
}

function buildCacheKey(config) {
  return `${config.username}:${config.token ? 'auth' : 'anon'}:${config.cacheMinutes}`;
}

async function loadFromGitHub(config) {
  const [profile, repoResult, contributionResult] = await Promise.all([
    fetchProfile(config.username, config.token),
    fetchAllRepos(config.username, config.token),
    fetchContributions(config.username, config.token),
  ]);

  const owned = repoResult.repositories.filter(repository => !repository.isFork);

  return {
    ok: true,
    source: 'github',
    authenticated: Boolean(config.token),
    profile,
    stats: {
      publicRepos: owned.length,
      totalStars: owned.reduce((sum, repository) => sum + repository.stars, 0),
      totalForks: owned.reduce((sum, repository) => sum + repository.forks, 0),
      followers: profile.followers,
      following: profile.following,
      totalsComplete: repoResult.totalsComplete,
    },
    repositories: repoResult.repositories,
    contributions: contributionResult.contributions,
    contributionsUnavailableReason: contributionResult.contributionsUnavailableReason,
    contributionsNotice: contributionResult.contributionsNotice,
  };
}

/**
 * Fetches from GitHub and stores the result in the cache. Concurrent callers
 * share a single upstream request. On failure the last verified response is
 * reused (clearly flagged) when it is still young enough to be trustworthy.
 */
function fetchAndCache(config, key) {
  if (inFlightRequest) return inFlightRequest;

  inFlightRequest = (async () => {
    try {
      const payload = await loadFromGitHub(config);
      const storedAt = Date.now();
      cache.key = key;
      cache.payload = {
        ...payload,
        meta: {
          fetchedAt: new Date(storedAt).toISOString(),
          cachedAt: new Date(storedAt).toISOString(),
          cacheTtlSeconds: Math.round(config.cacheMinutes * 60),
          fromCache: false,
          stale: false,
          ageSeconds: 0,
        },
      };
      cache.storedAt = storedAt;
      cache.expiresAt = storedAt + config.cacheMinutes * 60000;
      return cache.payload;
    } catch (error) {
      // GitHub is down or rate limited: keep showing the last verified
      // numbers instead of blanking the section or inventing new ones.
      if (cache.key === key && cache.payload && Date.now() - cache.storedAt < MAX_STALE_MINUTES * 60000) {
        console.warn(
          `[github] upstream fetch failed (${error.code || 'upstream-error'}): ${error.message} - serving cached data`
        );
        return {
          ...cache.payload,
          meta: {
            ...cache.payload.meta,
            fromCache: true,
            stale: true,
            upstreamError: error.code || 'upstream-error',
            ageSeconds: Math.round((Date.now() - cache.storedAt) / 1000),
          },
        };
      }
      throw error;
    } finally {
      inFlightRequest = null;
    }
  })();

  return inFlightRequest;
}

/**
 * Returns verified GitHub data for the configured account.
 *
 * A response is cached for `GITHUB_CACHE_MINUTES` so page loads do not burn
 * rate limit. Once that window passes the cached copy is still served straight
 * away (stale-while-revalidate) while a fresh fetch runs in the background, so
 * the section keeps updating instead of freezing on the first expired copy.
 */
async function getGitHubActivity() {
  const config = readConfig();

  if (!config.username) {
    throw new GitHubError('missing-username', 'GITHUB_USERNAME is not configured on the server.', 500);
  }

  const now = Date.now();
  const key = buildCacheKey(config);
  const matchesCache = cache.key === key && Boolean(cache.payload);

  if (matchesCache) {
    const ageMs = now - cache.storedAt;
    const isFresh = now < cache.expiresAt;
    const isUsableStale = ageMs < MAX_STALE_MINUTES * 60000;

    if (isFresh) {
      return {
        ...cache.payload,
        meta: { ...cache.payload.meta, fromCache: true, stale: false, ageSeconds: Math.round(ageMs / 1000) },
      };
    }

    if (isUsableStale) {
      // Expired but recent enough to keep showing. Refresh in the background
      // instead of returning early, otherwise this branch would serve the same
      // copy forever and the numbers would never update again.
      fetchAndCache(config, key).catch(() => {
        /* already logged inside fetchAndCache */
      });
      return {
        ...cache.payload,
        meta: { ...cache.payload.meta, fromCache: true, stale: true, ageSeconds: Math.round(ageMs / 1000) },
      };
    }
  }

  return fetchAndCache(config, key);
}

function toErrorResponse(error) {
  const status = error instanceof GitHubError ? error.status : 500;
  const code = error instanceof GitHubError ? error.code : 'internal-error';
  const message = error instanceof GitHubError ? error.message : 'Unexpected server error while loading GitHub data.';
  return { status, body: { ok: false, error: { code, message, ...(error instanceof GitHubError ? error.details : {}) } } };
}

function registerGitHubRoutes(app) {
  app.get('/api/github', async (request, response) => {
    try {
      response.set('Cache-Control', 'public, max-age=60');
      const payload = await getGitHubActivity();

      // A stale response is still a 200, so without this the upstream failure
      // that caused it would never appear in the logs and would be impossible
      // to diagnose from the server output.
      if (payload.meta?.stale && payload.meta.upstreamError) {
        console.warn(
          `[github] serving stale data (age ${payload.meta.ageSeconds}s) after upstream failure: ${payload.meta.upstreamError}`
        );
      }

      response.json(payload);
    } catch (error) {
      const failure = toErrorResponse(error);
      const code = error instanceof GitHubError ? error.code : 'internal-error';
      console.error(`[github] ${request.method} ${request.originalUrl} failed (${code}, HTTP ${failure.status}): ${error.message}`);
      response.status(failure.status).json(failure.body);
    }
  });
}

module.exports = { registerGitHubRoutes, getGitHubActivity, GitHubError };
