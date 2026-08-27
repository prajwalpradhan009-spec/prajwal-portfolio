# Prajjwal Pradhan Portfolio

A responsive developer portfolio with a static frontend and an optional Node.js/MongoDB contact API.

## Features

- Responsive portfolio website
- About, skills, projects, resume, and contact sections
- Portrait profile image with a fallback mark
- Contact form backed by MongoDB
- Express API with CORS and environment-based configuration
- Netlify configuration for the frontend
- Render Blueprint configuration for the backend

## Project Structure

```text
.
├── Frontend/       Static portfolio website
├── backend/        Express and MongoDB API
├── netlify.toml    Netlify frontend configuration
├── render.yaml     Render backend configuration
└── DEPLOYMENT.md   Deployment notes
```

## Run the Frontend

Open `Frontend/index.html` directly in a browser. The frontend does not require a build step or package installation.

To use the profile image, keep `Frontend/profile.jpg` beside the frontend HTML files. If it is missing, the site displays the default `PP` mark.

## Run the Backend

Requirements: Node.js 18 or later and a MongoDB database.

```powershell
Set-Location backend
npm install
Copy-Item .env.example .env
npm start
```

Edit `backend/.env` with your MongoDB connection details:

```text
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=prajjwal_portfolio
```

The API runs at `http://127.0.0.1:3000`.

## API Endpoints

| Method | Endpoint              | Description             |
| ------ | --------------------- | ----------------------- |
| `GET`  | `/api/health`         | API health check        |
| `GET`  | `/api/projects`       | List portfolio projects |
| `GET`  | `/api/projects/:slug` | Get one project         |
| `GET`  | `/api/skills`         | List skills             |
| `POST` | `/api/contact`        | Save a contact message  |

## Deployment

- **Frontend:** Import the repository into [Netlify](https://www.netlify.com/) and use the `Frontend` directory as the published directory. The included `netlify.toml` provides the project configuration.
- **Backend:** Create a Render Blueprint from the repository. Render reads `render.yaml`; add `MONGODB_URI` and other required environment variables in the Render dashboard.
- **Frontend API URL:** After deploying the backend, set its URL in `Frontend/config.js` as `window.PORTFOLIO_API_URL`.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full deployment checklist.

## Security

Never commit `backend/.env`, MongoDB credentials, or API keys. Local environment files are excluded by `.gitignore`.

## License

This project is for personal portfolio use.
