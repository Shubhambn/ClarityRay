import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '../../data/db.json');

const defaultDb = {
  users: [],
  analysisJobs: [],
  results: []
};

function ensureDbFile() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb, null, 2), 'utf8');
  }
}

export function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  const parsed = JSON.parse(raw || '{}');
  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    analysisJobs: Array.isArray(parsed.analysisJobs) ? parsed.analysisJobs : [],
    results: Array.isArray(parsed.results) ? parsed.results : []
  };
}

export function writeDb(nextDb) {
  fs.writeFileSync(DB_PATH, JSON.stringify(nextDb, null, 2), 'utf8');
}

export function updateDb(mutator) {
  const db = readDb();
  const next = mutator(db);
  writeDb(next ?? db);
  return next ?? db;
}
