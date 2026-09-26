# Free deployment with Render

The Render service hosts the portfolio frontend and the Node/MongoDB contact API together. The included `render.yaml` defines the service, build command, and start command.

## Render deployment

1. Create a free account at https://render.com.
2. Choose **New > Blueprint** and select the GitHub repository.
3. Render detects `render.yaml`. Enter your MongoDB Atlas connection string for `MONGODB_URI`.
4. Enter your GitHub handle for `GITHUB_USERNAME` and a personal access token for `GITHUB_TOKEN`.
5. Deploy the service.

The service URL opens the portfolio. The API health check is available at `<service-url>/api/health`.

The frontend automatically uses the same origin in production. If you host the frontend separately, copy the Render service URL, add `/api`, and put it in `Frontend/config.js` as `window.PORTFOLIO_API_URL`.

## Environment variables

`render.yaml` declares every variable the service needs. `MONGODB_URI`,
`GITHUB_USERNAME` and `GITHUB_TOKEN` use `sync: false`, so Render prompts for
their values instead of reading them from the repository.

| Variable               | Required | Purpose                                          |
| ---------------------- | -------- | ------------------------------------------------ |
| `MONGODB_URI`          | No       | Contact form storage; falls back to a local file |
| `GITHUB_USERNAME`      | Yes      | GitHub account the activity dashboard reads     |
| `GITHUB_TOKEN`         | Yes      | Personal access token, used on the server only   |
| `GITHUB_CACHE_MINUTES` | No       | GitHub cache lifetime, 1–60 (default 10)         |
| `PORT`                 | No       | Defaults to 3000                                |

You can also set them by hand under **Render > your service > Environment**.

### Creating the GitHub token

1. Open <https://github.com/settings/tokens>.
2. Create a **fine-grained** or **classic** personal access token.
3. For a fine-grained token, grant **Public repositories (read-only)** under
   repository permissions. For a classic token, no scope is required — `read:user`
   unlocks the most data.
4. Paste the token into Render's `GITHUB_TOKEN` value.

The token is only ever used server-side: `backend/github.js` sends it to
`api.github.com` and never includes it in an API response. Rotate it in GitHub
and update Render if it is ever exposed.

## MongoDB Atlas

Use a free M0 cluster and create a database user. In Atlas Network Access, allow the deployed service to connect. For a simple portfolio deployment, add `0.0.0.0/0` and use a strong database password. Never commit `.env` or credentials.

For local development:

```powershell
cd backend
Copy-Item .env.example .env
npm start
```

The local site can be opened from `Frontend/index.html`, and the local API runs on port 3000.

## Verifying the GitHub dashboard

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:3000/api/github |
  Select-Object -ExpandProperty stats
```

If `GITHUB_USERNAME` is missing the endpoint answers `500 missing-username`. If
the token is missing the dashboard still shows public repository data and reports
`contributionsUnavailableReason: "missing-token"`, and the section renders a
"Contribution data unavailable" state instead of inventing numbers.
