const path = require('node:path');
const fs = require('node:fs/promises');
const dns = require('node:dns');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose'); // Added Mongoose
const { registerGitHubRoutes } = require('./github');
const { registerChatRoutes, isGeminiConfigured, getConfiguredModel } = require('./chat');

// Loads variables from .env file
dotenv.config({ path: path.join(__dirname, '.env') });

// A `mongodb+srv://` URI is resolved with dns.resolveSrv, which uses the c-ares
// resolver rather than the operating system one. On machines where c-ares
// reports an unusable nameserver (for example a stale 127.0.0.1 entry left by a
// proxy or VPN client) every lookup fails with ECONNREFUSED even though the
// network is fine. DNS_SERVERS (comma separated) overrides that resolver, so a
// broken local configuration can be corrected from .env without a code change.
// It is unset on Render, where the default resolver already works.
const dnsServers = String(process.env.DNS_SERVERS || '')
  .split(',')
  .map(server => server.trim())
  .filter(Boolean);

if (dnsServers.length) {
  dns.setServers(dnsServers);
  console.log(`DNS resolver overridden with ${dnsServers.join(', ')} for mongodb+srv lookups.`);
}

const app = express();
const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI;
const contactsFile = path.join(__dirname, 'data', 'contacts.json');

// 1. Create a Mongoose Schema and Model for your Contacts
const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});
const Contact = mongoose.model('Contact', contactSchema);

let isDatabaseConnected = false;

// Render terminates TLS at its own proxy, so `request.ip` is only the real
// visitor address when the first proxy hop is trusted. The chat rate limiter
// relies on this to count visitors individually.
app.set('trust proxy', 1);

// CORS is open by default so the portfolio keeps working from any host, and can
// be locked to specific origins with ALLOWED_ORIGINS (comma separated). Entries
// may be written as bare hosts; they are normalised to https:// so a missing
// scheme or a trailing slash cannot silently block the real origin.
function normaliseOrigins(value) {
  return String(value || '')
    .split(',')
    .map(origin => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .map(origin => (/^https?:\/\//i.test(origin) ? origin : `https://${origin}`));
}

const allowedOrigins = normaliseOrigins(process.env.ALLOWED_ORIGINS);

app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));

// Prajwal AI is registered before the shared JSON parser: the chat route
// carries a conversation history and therefore sets its own, larger body limit.
registerChatRoutes(app);

app.use(express.json({ limit: '16kb' }));
app.get('/', (request, response) => {
  response.sendFile(path.join(__dirname, '..', 'Frontend', 'public', 'index.html'));
});
app.get('/prajwal-pradhan', (request, response) => {
  response.sendFile(path.join(__dirname, '..', 'Frontend', 'prajwal-pradhan.html'));
});
app.get('/sitemap.xml', (request, response) => {
  response.sendFile(path.join(__dirname, '..', 'Frontend', 'public', 'sitemap.xml'));
});
app.use(express.static(path.join(__dirname, '..', 'Frontend')));

const projects = [
  { slug: 'northstar-file-studio', title: 'Northstar File Studio', description: 'A focused utility for merging PDFs and converting, compressing and organizing images.', technologies: ['Python', 'CustomTkinter', 'Pillow'] },
];

const skills = {
  python: ['Python', 'Flask', 'FastAPI', 'REST APIs'],
  frontend: ['HTML / CSS', 'React.js', 'Vite', 'Tailwind CSS'],
  backend: ['Node.js', 'Express.js', 'MongoDB', 'Mongoose'],
  tools: ['GitHub', 'VS Code', 'UI / UX', 'AI tools']
};

function validateContact(body = {}) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();
  if (!name || !email || !message) return { error: 'Name, email and message are required' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Please provide a valid email address' };
  return { name, email, message };
}

async function saveContactToFile(contact) {
  let contacts = [];
  try {
    contacts = JSON.parse(await fs.readFile(contactsFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  contacts.push({ ...contact, created_at: new Date().toISOString() });
  await fs.writeFile(contactsFile, `${JSON.stringify(contacts, null, 2)}\n`);
}

app.get('/api/health', (request, response) => {
  response.json({ status: isDatabaseConnected ? 'ok' : 'degraded', service: 'prajjwal-portfolio-api', database: isDatabaseConnected });
});

app.get('/api/projects', (request, response) => response.json(projects));

app.get('/api/projects/:slug', (request, response) => {
  const project = projects.find((item) => item.slug === request.params.slug);
  if (!project) return response.status(404).json({ error: 'Project not found' });
  return response.json(project);
});

app.get('/api/skills', (request, response) => response.json(skills));

// Live GitHub dashboard data. Credentials stay on the server; the response
// only ever contains public profile data.
registerGitHubRoutes(app);

app.post('/api/contact', async (request, response) => {
  const contactData = validateContact(request.body);
  if (contactData.error) return response.status(400).json({ error: contactData.error });
  
  if (!isDatabaseConnected) {
    try {
      await saveContactToFile(contactData);
      return response.status(201).json({ message: 'Message received. Saved locally.' });
    } catch (error) {
      console.error('Local contact save failed:', error.message);
      return response.status(500).json({ error: 'Unable to save your message right now.' });
    }
  }

  try {
    // 2. Use Mongoose to save the new contact to Atlas
    await Contact.create(contactData);
    return response.status(201).json({ message: 'Message received. Thank you.' });
  } catch (error) {
    console.error('Contact insert failed:', error.message);
    return response.status(500).json({ error: 'Unable to save your message right now.' });
  }
});

// Values come from backend/.env in local development and from the host's
// environment variable settings in production (Render's dashboard). The
// warnings below name both places, because "missing in .env file" is
// misleading on a host that never reads a .env file at all.
const CONFIG_HINT =
  'Set it in backend/.env for local development, or in the host dashboard (Render: Environment) for production.';

async function startServer() {
  // 3. Connect to MongoDB using the URI from your environment
  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri, { family: 4 });
      isDatabaseConnected = true;
      console.log("Database Connected Successfully!");
    } catch (error) {
      console.error("Database Connection Failed:", error.message);
    }
  } else {
    console.warn(`MONGODB_URI is not set, so the API started without database access and /api/contact will save to a local file instead. ${CONFIG_HINT}`);
  }

  if (process.env.GITHUB_USERNAME) {
    console.log(`GitHub activity enabled for ${process.env.GITHUB_USERNAME} (${process.env.GITHUB_TOKEN ? 'authenticated' : 'public data only'}).`);
  } else {
    console.warn(`GITHUB_USERNAME is not set, so /api/github will report a configuration error. ${CONFIG_HINT}`);
  }

  if (isGeminiConfigured()) {
    console.log(`Prajwal AI enabled (model: ${getConfiguredModel()}).`);
  } else {
    console.warn(`GEMINI_API_KEY is not set, so /api/chat will report that Prajwal AI is unavailable. ${CONFIG_HINT}`);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Portfolio API running on port ${port}`);
  });
}

async function shutdown() {
  await mongoose.disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
startServer();