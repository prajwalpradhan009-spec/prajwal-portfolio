# Prajjwal Pradhan Portfolio

A responsive developer portfolio built with plain HTML, CSS, and JavaScript, with an optional Express API for the contact form.

## Highlights

- Responsive portfolio with About, skills, education, projects, services, and contact sections
- Light and dark themes with a mobile navigation menu
- Downloadable resume page and profile imagery
- Project details modal with GitHub and download links
- Express API with CORS, health checks, project data, skills data, and contact handling
- MongoDB persistence with a local JSON fallback for simple development

## Tech Stack

**Frontend:** HTML5, CSS3, vanilla JavaScript, Lucide icons

**Backend:** Node.js, Express, Mongoose, MongoDB, dotenv

## Project Structure

```text
.
├── Frontend/
│   ├── index.html       Portfolio page
│   ├── resume.html      Resume page
│   ├── styles.css       Responsive styles and themes
│   ├── script.js        Interactions and contact form logic
│   ├── config.js        Frontend API URL configuration
│   ├── profile.jpg      Optional profile image
│   └── 22.png           About section image
├── backend/
│   ├── server.js        Express API and static file server
│   ├── package.json     Backend scripts and dependencies
│   └── data/
│       └── contacts.json Local fallback contact storage
├── render.yaml          Render service configuration
├── DEPLOYMENT.md        Deployment checklist
└── README.md
```

## Run Locally

### Frontend only

The frontend has no build step or frontend dependencies. Open `Frontend/index.html` directly in a browser.

The contact form expects the backend at `http://127.0.0.1:3000` when the page is opened with the `file:` protocol.

### Full application

Requirements: Node.js 18 or later. MongoDB is optional because the API falls back to `backend/data/contacts.json` when `MONGODB_URI` is not configured.

```powershell
Set-Location backend
npm install
```

Create `backend/.env`:

```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority
```

Start the API:

```powershell
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) to use the portfolio through the backend. During development, `npm run dev` starts Node's watch mode.

## API

| Method | Endpoint              | Description                            |
| ------ | --------------------- | -------------------------------------- |
| `GET`  | `/api/health`         | Reports API and database status        |
| `GET`  | `/api/projects`       | Returns all portfolio projects         |
| `GET`  | `/api/projects/:slug` | Returns one project by slug            |
| `GET`  | `/api/skills`         | Returns skills grouped by category     |
| `POST` | `/api/contact`        | Validates and stores a contact message |

Example contact request:

```powershell
Invoke-RestMethod -Method Post `
	-Uri http://127.0.0.1:3000/api/contact `
	-ContentType 'application/json' `
	-Body '{"name":"Jane Doe","email":"jane@example.com","message":"Hello!"}'
```

## Deployment

### Render

Create a Render Blueprint from this repository. Render uses the included `render.yaml` to install dependencies and start the Express service. The service serves both the portfolio frontend and the API.

Set `MONGODB_URI` as a secret environment variable in Render. After deployment, the portfolio is available at the Render service URL and the API is available under `/api`.

If the frontend is hosted separately, set its API base URL in `Frontend/config.js`:

```js
window.PORTFOLIO_API_URL = "https://your-api.onrender.com/api";
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for the deployment checklist.

## Security

Never commit `backend/.env`, MongoDB credentials, or API keys. Environment files are excluded by `.gitignore`.

## License

This project is for personal portfolio use.
