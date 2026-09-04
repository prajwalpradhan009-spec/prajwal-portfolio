# Free deployment with Render

The Render service hosts the portfolio frontend and the Node/MongoDB contact API together. The included `render.yaml` defines the service, build command, and start command.

## Render deployment

1. Create a free account at https://render.com.
2. Choose **New > Blueprint** and select the GitHub repository.
3. Render detects `render.yaml`. Enter your MongoDB Atlas connection string for `MONGODB_URI`.
4. Deploy the service.

The service URL opens the portfolio. The API health check is available at `<service-url>/api/health`.

The frontend automatically uses the same origin in production. If you host the frontend separately, copy the Render service URL, add `/api`, and put it in `Frontend/config.js` as `window.PORTFOLIO_API_URL`.

## MongoDB Atlas

Use a free M0 cluster and create a database user. In Atlas Network Access, allow the deployed service to connect. For a simple portfolio deployment, add `0.0.0.0/0` and use a strong database password. Never commit `.env` or credentials.

For local development:

```powershell
cd backend
npm start
```

The local site can be opened from `Frontend/index.html`, and the local API runs on port 3000.
