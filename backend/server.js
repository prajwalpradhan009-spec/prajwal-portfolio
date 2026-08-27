const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || 'prajjwal_portfolio';
const contactsFile = path.join(__dirname, 'data', 'contacts.json');
const mongoClient = mongoUri
  ? new MongoClient(mongoUri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 30000,
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000
    })
  : null;

let database;

app.use(cors());
app.use(express.json({ limit: '16kb' }));
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
  response.json({ status: database ? 'ok' : 'degraded', service: 'prajjwal-portfolio-api', database: Boolean(database) });
});

app.get('/api/projects', (request, response) => response.json(projects));

app.get('/api/projects/:slug', (request, response) => {
  const project = projects.find((item) => item.slug === request.params.slug);
  if (!project) return response.status(404).json({ error: 'Project not found' });
  return response.json(project);
});

app.get('/api/skills', (request, response) => response.json(skills));

app.post('/api/contact', async (request, response) => {
  const contact = validateContact(request.body);
  if (contact.error) return response.status(400).json({ error: contact.error });
  if (!database) {
    try {
      await saveContactToFile(contact);
      return response.status(201).json({ message: 'Message received. Saved locally.' });
    } catch (error) {
      console.error('Local contact save failed:', error.message);
      return response.status(500).json({ error: 'Unable to save your message right now.' });
    }
  }

  try {
    await database.collection('contacts').insertOne({ ...contact, createdAt: new Date() });
    return response.status(201).json({ message: 'Message received. Thank you.' });
  } catch (error) {
    console.error('Contact insert failed:', error.message);
    return response.status(500).json({ error: 'Unable to save your message right now.' });
  }
});

async function startServer() {
  if (mongoClient) {
    try {
      await mongoClient.connect();
      database = mongoClient.db(databaseName);
      await database.command({ ping: 1 });
      const contactsCollection = await database.listCollections({ name: 'contacts' }).hasNext();
      if (!contactsCollection) await database.createCollection('contacts');
      console.log(`MongoDB connected: ${databaseName}`);
    } catch (error) {
      console.error('MongoDB connection failed:', error.message);
    }
  } else {
    console.warn('MONGODB_URI is missing. API started without database access.');
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Portfolio API running on port ${port}`);
  });
}

async function shutdown() {
  if (mongoClient) await mongoClient.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
startServer();
