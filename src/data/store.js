const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * A minimal, file-backed JSON "database".
 *
 * Why not a real database for a hackathon submission?
 *  - Zero setup: `npm install && npm start` works on a fresh clone with no
 *    external services, credentials, or migrations.
 *  - The data shape is small and read/write patterns are simple, so a single
 *    JSON document is genuinely sufficient for the demo's scale.
 *
 * Design: the whole document is held in memory after first load, and every
 * mutation persists synchronously to disk before the request continues.
 * This deliberately avoids a read-after-write race (an earlier version of
 * this file mixed synchronous reads with a queued *async* write, so a read
 * immediately after a write could see stale data - now reads always see
 * the latest in-memory state, and persistence is synchronous so a crash
 * right after a request can't silently lose it).
 *
 * Concurrency note: this is correct for a single Node process. A
 * multi-instance production deployment would need a real database with
 * proper transactions (see README > Roadmap).
 */

const EMPTY_DB = { users: {}, activities: {} };

let cachedDb = null;
let cachedPath = null;

function getDbPath() {
  return process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, '..', '..', 'data', 'db.json');
}

function loadFromDisk(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(EMPTY_DB, null, 2));
  }
  try {
    const raw = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    logger.error('Failed to read/parse db.json - starting from an empty store', {
      error: err.message,
    });
    return { users: {}, activities: {} };
  }
}

function getDb() {
  const dbPath = getDbPath();
  if (cachedDb === null || cachedPath !== dbPath) {
    cachedDb = loadFromDisk(dbPath);
    cachedPath = dbPath;
  }
  return cachedDb;
}

function persist() {
  const dbPath = cachedPath || getDbPath();
  const tmpPath = `${dbPath}.tmp`;
  // Write-then-rename is atomic on POSIX filesystems, so a crash mid-write
  // can never leave a half-written db.json behind.
  fs.writeFileSync(tmpPath, JSON.stringify(cachedDb, null, 2));
  fs.renameSync(tmpPath, dbPath);
}

// ---- Users ----

function createUser(user) {
  const db = getDb();
  db.users[user.id] = user;
  db.activities[user.id] = db.activities[user.id] || [];
  persist();
  return user;
}

function getUser(userId) {
  return getDb().users[userId] || null;
}

function updateUser(userId, patch) {
  const db = getDb();
  if (!db.users[userId]) return null;
  db.users[userId] = { ...db.users[userId], ...patch, id: userId };
  persist();
  return db.users[userId];
}

// ---- Activities ----

function addActivity(userId, activity) {
  const db = getDb();
  if (!db.users[userId]) return null;
  db.activities[userId] = db.activities[userId] || [];
  db.activities[userId].push(activity);
  persist();
  return activity;
}

function getActivities(userId) {
  return getDb().activities[userId] || [];
}

module.exports = {
  createUser,
  getUser,
  updateUser,
  addActivity,
  getActivities,
};
