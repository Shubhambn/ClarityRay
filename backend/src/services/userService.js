import { readDb, writeDb } from '../models/database.js';

function sanitizeUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

export function getUserProfile(userId) {
  const db = readDb();
  const user = db.users.find((candidate) => candidate.id === userId);
  if (!user) return null;
  return sanitizeUser(user);
}

export function updateUserSettings(userId, payload) {
  const db = readDb();
  const user = db.users.find((candidate) => candidate.id === userId);
  if (!user) return null;

  const now = new Date().toISOString();
  user.name = payload.name ?? user.name;
  user.preferences = {
    ...user.preferences,
    ...(payload.preferences ?? {})
  };
  user.updatedAt = now;

  writeDb(db);
  return sanitizeUser(user);
}
