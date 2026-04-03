import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { readDb, writeDb } from '../models/database.js';
import { createToken } from './tokenService.js';

function sanitizeUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

export async function signup({ name, email, password }) {
  const db = readDb();
  const existing = db.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    const err = new Error('An account with this email already exists.');
    err.status = 409;
    throw err;
  }

  const now = new Date().toISOString();
  const user = {
    id: uuid(),
    name,
    email: email.toLowerCase(),
    passwordHash: await bcrypt.hash(password, 10),
    preferences: {
      showDisclaimerAlways: true,
      saveLocalHistory: true,
      enableDesktopNotifications: false
    },
    createdAt: now,
    updatedAt: now
  };

  db.users.push(user);
  writeDb(db);

  return {
    user: sanitizeUser(user),
    token: createToken(user)
  };
}

export async function login({ email, password }) {
  const db = readDb();
  const user = db.users.find((candidate) => candidate.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    const err = new Error('Invalid email or password.');
    err.status = 401;
    throw err;
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    const err = new Error('Invalid email or password.');
    err.status = 401;
    throw err;
  }

  return {
    user: sanitizeUser(user),
    token: createToken(user)
  };
}
