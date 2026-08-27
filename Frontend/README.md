# Prajjwal Pradhan Portfolio

This is a fast, dependency-free portfolio front end. Open `index.html` directly in a browser or deploy the folder to Netlify or Vercel.

## Add the portrait logo

Save the supplied portrait beside `index.html` with this exact filename:

```text
profile.jpg
```

The same image is used in the navbar logo and the About section. If the file is missing, both locations fall back to the `PP` mark.

## Node.js and MongoDB backend

The portfolio highlights Python, Flask, FastAPI, Node.js, Express and MongoDB. A production backend can expose these REST endpoints:

```text
GET    /api/projects
GET    /api/projects/:slug
POST   /api/contact
GET    /api/skills
```

### Setup

```powershell
cd backend
npm install
Copy-Item .env.example .env
# Add your MongoDB Atlas URI to .env, then start the server.
npm start
```

The API runs at `http://127.0.0.1:3000`. The contact form sends data to MongoDB through `POST /api/contact`. Project and skill data are available through `GET /api/projects` and `GET /api/skills`.

Required `.env` values:

```text
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=prajjwal_portfolio
```

The server uses one shared MongoDB client with a conservative pool for this small portfolio workload. Contacts are stored in the `contacts` collection. Never commit `.env` or credentials.
