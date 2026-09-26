# Prajjwal Pradhan — Portfolio

A fast, responsive developer portfolio built with plain HTML, CSS and JavaScript, with an optional Express API for the contact form. Light and dark themes, animated sections, and a mobile-first layout that stays smooth on tap.

## Highlights

- Fully responsive single page: Hero, About, Skills, Education, Projects, GitHub Activity, Services, Contact
- Light / dark themes (persisted) with an animated header and scroll progress bar
- Mobile navigation menu and touch-optimized interactions (no label taps, no sticky hover)
- **Live GitHub Activity dashboard** — public repos, stars, forks, followers, a 12-month contribution graph and a 53-week contribution calendar, all fetched from the real GitHub API on every visit
- Project showcase with custom artwork and animations:
  - **Northstar File Studio** — featured, PDF/image desktop utility
  - **NovaCart** — E-commerce store, marked "Project In Progress"
- Project detail modal with GitHub and download links
- Downloadable HTML resume (`Frontend/resume.html`)
- Express API with CORS, health checks, projects/skills data, GitHub proxying, and contact handling
- MongoDB persistence with a local JSON fallback for simple development

## Tech Stack

**Frontend:** HTML5, CSS3, vanilla JavaScript, Lucide icons, Google Fonts (DM Mono, Manrope)

**Backend:** Node.js 18+, Express, Mongoose, MongoDB, dotenv

## Project Structure

```text
.
├── Frontend/
│   ├── index.html       Portfolio page
│   ├── resume.html      Resume page
│   ├── styles.css       Responsive styles, themes and animations
│   ├── github.css       GitHub Activity dashboard styles
│   ├── script.js        Interactions, project cards and contact logic
│   ├── github.js        GitHub dashboard: fetch, states, chart, calendar
│   ├── config.js        Frontend API URL configuration
│   ├── profile.jpg      Navbar profile logo
│   ├── img.png          About section photo
│   └── README.md        Frontend-specific notes
├── backend/
│   ├── server.js        Express API and static file server
│   ├── github.js        GitHub API client, cache and /api/github route
│   ├── .env.example     Environment variable template
│   ├── package.json     Backend scripts and dependencies
│   └── data/
│       └── contacts.json Local fallback contact storage
├── render.yaml          Render service configuration
├── DEPLOYMENT.md        Deployment checklist
└── README.md
```

## Run Locally

### Frontend only

The frontend has no build step or dependencies — open `Frontend/index.html` directly in a browser.

The contact form and the GitHub dashboard expect the backend at `http://127.0.0.1:3000` when the page is opened with the `file:` protocol.

### Full application

Requirements: Node.js 18 or later. MongoDB is optional because the API falls back to `backend/data/contacts.json` when `MONGODB_URI` is not configured.

```powershell
Set-Location backend
npm install
Copy-Item .env.example .env
```

Fill in `backend/.env`:

```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority
GITHUB_USERNAME=<your-github-handle>
GITHUB_TOKEN=<your-github-personal-access-token>
```

Start the API:

```powershell
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) to use the portfolio through the backend. During development, `npm run dev` starts Node's watch mode.

## API

| Method | Endpoint              | Description                                       |
| ------ | --------------------- | ------------------------------------------------- |
| `GET`  | `/api/health`         | Reports API and database status                   |
| `GET`  | `/api/projects`       | Returns all portfolio projects                    |
| `GET`  | `/api/projects/:slug` | Returns one project by slug                       |
| `GET`  | `/api/skills`         | Returns skills grouped by category                |
| `GET`  | `/api/github`         | Returns verified live GitHub data (see below)     |
| `POST` | `/api/contact`        | Validates and stores a contact message            |

Example contact request:

```powershell
Invoke-RestMethod -Method Post `
	-Uri http://127.0.0.1:3000/api/contact `
	-ContentType 'application/json' `
	-Body '{"name":"Jane Doe","email":"jane@example.com","message":"Hello!"}'
```

## GitHub Activity Dashboard

`GET /api/github` proxies the GitHub API so the personal access token never
reaches the browser. Every figure in the response comes straight from GitHub —
nothing is hard-coded, estimated or filled in with placeholders.

```jsonc
{
  "ok": true,
  "authenticated": true,
  "profile": { "username": "…", "name": "…", "avatarUrl": "…", "profileUrl": "…", "bio": "…", "location": "…", "followers": 0, "following": 0 },
  "stats": { "publicRepos": 3, "totalStars": 3, "totalForks": 0, "followers": 0, "following": 0, "totalsComplete": true },
  "repositories": [ { "name": "…", "url": "…", "language": "…", "stars": 1, "forks": 0, "topics": [], "isFork": false, "isArchived": false, "updatedAt": "…" } ],
  "contributions": { "totalLastYear": 49, "totalLast30Days": 29, "totalLast7Days": 9, "activeDays": 19, "currentStreak": 0, "longestStreak": 4, "weeks": [ /* 53 weeks of days */ ] },
  "contributionsUnavailableReason": null,
  "meta": { "fetchedAt": "…", "cacheTtlSeconds": 600, "fromCache": false, "stale": false }
}
```

How it behaves:

- **Automatic updates.** The frontend requests `/api/github` on load, then re-checks shortly after the server cache expires. The server caches a verified response for `GITHUB_CACHE_MINUTES` (default 10) and collapses concurrent requests into a single upstream call.
- **Graceful degradation.** If GitHub is unreachable or rate limited, the last verified response is served with `meta.stale: true` and the dashboard labels itself "Last verified …". If nothing has ever been cached, the endpoint returns a structured error and the section shows a clean error state with a retry button.
- **Contribution data is never faked.** The contribution calendar comes from GitHub's official GraphQL API, which requires authentication. Without a valid `GITHUB_TOKEN`, `contributions` is `null`, `contributionsUnavailableReason` explains why, and the section shows a "Contribution data unavailable" panel instead of a chart.
- **No secret in the response.** The token is only ever sent from the server to `api.github.com`; it is never included in any API response, log line, or frontend file.

## Mobile & Touch

- `touch-action: manipulation` prevents double-tap zoom delays on buttons and links
- `-webkit-tap-highlight-color: transparent` removes the tap flash on iOS
- Hover-only effects (card lifts, borders) are disabled on touch devices via `@media (hover: none)`
- Reduced-motion users get all animations and transitions switched off
- The contribution chart and calendar scroll horizontally on narrow screens instead of shrinking into unreadable squares

## Deployment

### Render

Create a Render Blueprint from this repository. Render uses the included `render.yaml` to install dependencies and start the Express service, which serves both the portfolio frontend and the API.

Set these as secret environment variables in Render:

| Variable                | Required | Purpose                                            |
| ----------------------- | -------- | -------------------------------------------------- |
| `MONGODB_URI`           | No       | Contact form storage; falls back to a local file   |
| `GITHUB_USERNAME`       | Yes      | GitHub account the dashboard reads                 |
| `GITHUB_TOKEN`          | Yes      | Personal access token, server-side only            |
| `GITHUB_CACHE_MINUTES`  | No       | Cache lifetime, 1–60 (default 10)                 |

After deployment, the portfolio is available at the Render service URL and the API under `/api`.

If the frontend is hosted separately, set its API base URL in `Frontend/config.js`:

```js
window.PORTFOLIO_API_URL = "https://your-api.onrender.com/api";
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for the deployment checklist.

## Security

Never commit `backend/.env`, MongoDB credentials, GitHub tokens, or API keys. `.env` files are excluded by `.gitignore` while `.env.example` stays tracked as a template. The GitHub token is read from `process.env` inside `backend/github.js` and is never sent to the frontend.

## License

This project is for personal portfolio use.