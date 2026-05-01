'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'botify.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT '',
      session_id TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at INTEGER DEFAULT (strftime('%s','now')),
      expires_at INTEGER DEFAULT (strftime('%s','now') + 2592000),
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      expires_at INTEGER DEFAULT (strftime('%s','now') + 86400)
    );

    CREATE TABLE IF NOT EXISTS pairing_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      code TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      session_data TEXT DEFAULT '',
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);
}

function addUser({ phone, name = '', notes = '' }) {
  const database = getDb();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 30 * 24 * 60 * 60; // 30 days
  try {
    const stmt = database.prepare(`
      INSERT INTO users (phone, name, notes, created_at, expires_at, status)
      VALUES (?, ?, ?, ?, ?, 'active')
      ON CONFLICT(phone) DO UPDATE SET
        name = excluded.name,
        notes = excluded.notes,
        expires_at = excluded.expires_at,
        status = 'active'
    `);
    stmt.run(phone, name, notes, now, expiresAt);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function removeUser(phone) {
  const database = getDb();
  database.prepare('DELETE FROM users WHERE phone = ?').run(phone);
}

function getAllUsers() {
  const database = getDb();
  return database.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
}

function getUser(phone) {
  const database = getDb();
  return database.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
}

function updateUserStatus(phone, status) {
  const database = getDb();
  database.prepare('UPDATE users SET status = ? WHERE phone = ?').run(status, phone);
}

function updateUserSession(phone, sessionId) {
  const database = getDb();
  database.prepare('UPDATE users SET session_id = ?, status = ? WHERE phone = ?').run(sessionId, 'active', phone);
}

function isUserActive(phone) {
  const database = getDb();
  const now = Math.floor(Date.now() / 1000);
  const user = database.prepare(
    'SELECT * FROM users WHERE phone = ? AND status = ? AND expires_at > ?'
  ).get(phone, 'active', now);
  return !!user;
}

function expireOldUsers() {
  const database = getDb();
  const now = Math.floor(Date.now() / 1000);
  database.prepare(
    "UPDATE users SET status = 'expired' WHERE expires_at < ? AND status = 'active'"
  ).run(now);
}

function createAdminSession(sessionId, username) {
  const database = getDb();
  const now = Math.floor(Date.now() / 1000);
  database.prepare(
    'INSERT INTO admin_sessions (id, username, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(sessionId, username, now, now + 86400);
}

function getAdminSession(sessionId) {
  const database = getDb();
  const now = Math.floor(Date.now() / 1000);
  return database.prepare(
    'SELECT * FROM admin_sessions WHERE id = ? AND expires_at > ?'
  ).get(sessionId, now);
}

function deleteAdminSession(sessionId) {
  const database = getDb();
  database.prepare('DELETE FROM admin_sessions WHERE id = ?').run(sessionId);
}

function savePairingRequest(phone, code) {
  const database = getDb();
  database.prepare(
    'INSERT INTO pairing_requests (phone, code, status) VALUES (?, ?, ?)'
  ).run(phone, code, 'waiting');
  return database.prepare('SELECT last_insert_rowid() as id').get().id;
}

function updatePairingSession(phone, sessionData) {
  const database = getDb();
  database.prepare(
    "UPDATE pairing_requests SET session_data = ?, status = 'done' WHERE phone = ? AND status != 'done'"
  ).run(sessionData, phone);
}

function getPairingRequest(phone) {
  const database = getDb();
  return database.prepare(
    'SELECT * FROM pairing_requests WHERE phone = ? ORDER BY created_at DESC LIMIT 1'
  ).get(phone);
}

module.exports = {
  getDb,
  addUser,
  removeUser,
  getAllUsers,
  getUser,
  updateUserStatus,
  updateUserSession,
  isUserActive,
  expireOldUsers,
  createAdminSession,
  getAdminSession,
  deleteAdminSession,
  savePairingRequest,
  updatePairingSession,
  getPairingRequest,
};
