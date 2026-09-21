# Prajjwal Pradhan — Portfolio

A fast, responsive developer portfolio built with plain HTML, CSS and JavaScript, with an optional Express API for the contact form. Light and dark themes, animated sections, and a mobile-first layout that stays smooth on tap.

## Highlights

- Fully responsive single page: Hero, About, Skills, Education, Projects, Services, Contact
- Light / dark themes (persisted) with an animated header and scroll progress bar
- Mobile navigation menu and touch-optimized interactions (no label taps, no sticky hover)
- Project showcase with custom artwork and animations:
  - **Northstar File Studio** — featured, PDF/image desktop utility
  - **NovaCart** — E-commerce store, marked "Project In Progress"
- Project detail modal with GitHub and download links
- Downloadable HTML resume (`Frontend/resume.html`)
- Express API with CORS, health checks, projects/skills data, and contact handling
- MongoDB persistence with a local JSON fallback for simple development

## Tech Stack

**Frontend:** HTML5, CSS3, vanilla JavaScript, Lucide icons, Google Fonts (DM Mono, Manrope)

**Backend:** Node.js, Express, Mongoose, MongoDB, dotenv

## Project Structure

```text
.
├── Frontend/
│   ├── index.html       Portfolio page
│   ├── resume.html      Resume page
│   ├── styles.css       Responsive styles, themes and animations
│   ├── script.js        Interactions, project cards and contact logic
│   ├── config.js        Frontend API URL configuration
│   ├── profile.jpg      Navbar profile logo
│   ├── img.png          About section photo
│   └── README.md        Frontend-specific notes
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

The frontend has no build step or dependencies — open `Frontend/index.html` directly in a browser.

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

## Mobile & Touch

- `touch-action: manipulation` prevents double-tap zoom delays on buttons and links
- `-webkit-tap-highlight-color: transparent` removes the tap flash on iOS
- Hover-only effects (card lifts, borders) are disabled on touch devices via `@media (hover: none)`
- Reduced-motion users get all animations and transitions switched off

## Deployment

### Render

Create a Render Blueprint from this repository. Render uses the included `render.yaml` to install dependencies and start the Express service, which serves both the portfolio frontend and the API.

Set `MONGODB_URI` as a secret environment variable in Render. After deployment, the portfolio is available at the Render service URL and the API under `/api`.

If the frontend is hosted separately, set its API base URL in `Frontend/config.js`:

```js
window.PORTFOLIO_API_URL = "https://your-api.onrender.com/api";
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for the deployment checklist.

## Security

Never commit `backend/.env`, MongoDB credentials, or API keys. Environment files are excluded by `.gitignore`.

## License

This project is for personal portfolio use.