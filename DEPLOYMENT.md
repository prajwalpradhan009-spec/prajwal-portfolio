# Free deployment

The frontend is configured for Netlify. The Node/MongoDB contact API must run separately on Render because Netlify hosts static frontend files, not a continuously running Express server.

## Netlify frontend

1. Create a GitHub repository and upload this project folder.
2. Create a free account at https://netlify.com.
3. Choose **Add new site > Import an existing project** and select the repository.
4. Netlify detects `netlify.toml` and publishes the `Frontend` folder.

## Render backend

1. Create a free account at https://render.com.
2. Choose **New > Blueprint** and select the GitHub repository.
3. Render detects `render.yaml`. Enter your MongoDB Atlas connection string for `MONGODB_URI`.
4. Deploy the service.

Copy the Render service URL, add `/api` to it, and put it in `Frontend/config.js` as `window.PORTFOLIO_API_URL`. Commit and push that change so Netlify redeploys the frontend. The API health check is at `/api/health`.

## MongoDB Atlas

Use a free M0 cluster and create a database user. In Atlas Network Access, allow the deployed service to connect. For a simple portfolio deployment, add `0.0.0.0/0` and use a strong database password. Never commit `.env` or credentials.

For local development:

```powershell
cd backend
npm start
```

The local site can be opened from `Frontend/index.html`, and the local API runs on port 3000.
