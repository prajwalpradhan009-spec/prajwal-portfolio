# Prajjwal Pradhan Portfolio

This is a fast, dependency-free portfolio front end. Open `index.html` directly in a browser, or serve it through the Express backend in `../backend`, which is how it is deployed on Render.

## Files

| File           | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `index.html`   | Portfolio page, including the GitHub Activity section           |
| `styles.css`   | Site-wide responsive styles, themes and animations             |
| `github.css`   | GitHub Activity dashboard styles                                |
| `script.js`    | Navigation, theme toggle, project cards, contact form          |
| `github.js`    | GitHub dashboard: fetch, loading/error/empty states, chart      |
| `config.js`    | Optional API base URL override                                  |
| `cyber-cursor.js` / `cyber-cursor.css` | Desktop cyber cursor, particle trail and interaction states |
| `resume.html`  | Standalone resume page                                          |

The cyber cursor is enabled only for fine-pointer devices when reduced motion
is not requested. Touch devices and visitors who prefer reduced motion retain
the browser cursor and the page's existing interactions.

## Add the portrait logo

Save the supplied portrait beside `index.html` with this exact filename:

```text
profile.jpg
```

The same image is used in the navbar logo and the About section. If the file is missing, both locations fall back to the `PP` mark. The About section also uses `img.png` beside `index.html`.

## GitHub Activity dashboard

`github.js` requests `GET /api/github` from the backend and renders whatever
verified data comes back. It never receives a GitHub token and never invents a
number: a missing value is rendered as `—` or as an explicit unavailable state.

```text
apiBase = window.PORTFOLIO_API_URL || (isLocal ? "http://127.0.0.1:3000/api" : `${location.origin}/api`)
```

`isLocal` is true for the `file:` protocol and for `localhost` / `127.0.0.1`, so
opening `index.html` straight from disk still reaches the local backend.

The dashboard re-requests the endpoint shortly after the server cache expires,
and again when a stale tab becomes visible, so new GitHub activity appears
without a reload.

## Node.js and MongoDB backend

The portfolio highlights Python, Flask, FastAPI, Node.js, Express and MongoDB. The backend in `../backend` exposes these REST endpoints:

```text
GET    /api/health
GET    /api/projects
GET    /api/projects/:slug
GET    /api/skills
GET    /api/github
POST   /api/contact
```

### Setup

```powershell
cd ../backend
npm install
Copy-Item .env.example .env
# Add your MongoDB Atlas URI and GitHub credentials to .env, then start the server.
npm start
```

The API runs at `http://127.0.0.1:3000`. The contact form sends data to MongoDB through `POST /api/contact`. Project and skill data are available through `GET /api/projects` and `GET /api/skills`.

Required `.env` values:

```text
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
GITHUB_USERNAME=<your-github-handle>
GITHUB_TOKEN=<your-github-personal-access-token>
```

`GITHUB_TOKEN` is read only by the backend. It is never sent to the browser and must never be pasted into `config.js`, `script.js` or `github.js`.

The server uses one shared MongoDB client with a conservative pool for this small portfolio workload. Contacts are stored in the `contacts` collection. Never commit `.env` or credentials.
