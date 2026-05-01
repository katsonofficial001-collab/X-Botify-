'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'botify.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

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
  const d = getDb();
  d.exec(`
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

    CREATE TABLE IF NOT EXISTS group_settings (
      group_id TEXT PRIMARY KEY,
      antilink INTEGER DEFAULT 0,
      antilink_action TEXT DEFAULT 'warn',
      antidelete INTEGER DEFAULT 0,
      antiedit INTEGER DEFAULT 0,
      antistatusmention INTEGER DEFAULT 0,
      welcome INTEGER DEFAULT 0,
      welcome_msg TEXT DEFAULT '',
      bye INTEGER DEFAULT 0,
      bye_msg TEXT DEFAULT '',
      hidetag INTEGER DEFAULT 0,
      antiflood INTEGER DEFAULT 0,
      antiflood_max INTEGER DEFAULT 5,
      antiflood_action TEXT DEFAULT 'warn'
    );

    CREATE TABLE IF NOT EXISTS antilink_warns (
      phone TEXT NOT NULL,
      group_id TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      PRIMARY KEY (phone, group_id)
    );
  `);
}

/* ── Users ─────────────────────────────────────────────── */
function addUser({ phone, name = '', notes = '' }) {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 30 * 24 * 60 * 60;
  try {
    d.prepare(`
      INSERT INTO users (phone, name, notes, created_at, expires_at, status)
      VALUES (?, ?, ?, ?, ?, 'active')
      ON CONFLICT(phone) DO UPDATE SET
        name = excluded.name, notes = excluded.notes,
        expires_at = excluded.expires_at, status = 'active'
    `).run(phone, name, notes, now, expiresAt);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

function removeUser(phone) { getDb().prepare('DELETE FROM users WHERE phone = ?').run(phone); }
function getAllUsers() { return getDb().prepare('SELECT * FROM users ORDER BY created_at DESC').all(); }
function getUser(phone) { return getDb().prepare('SELECT * FROM users WHERE phone = ?').get(phone); }
function updateUserStatus(phone, status) { getDb().prepare('UPDATE users SET status = ? WHERE phone = ?').run(status, phone); }
function updateUserSession(phone, sessionId) { getDb().prepare('UPDATE users SET session_id = ?, status = ? WHERE phone = ?').run(sessionId, 'active', phone); }

function isUserActive(phone) {
  const now = Math.floor(Date.now() / 1000);
  return !!getDb().prepare('SELECT 1 FROM users WHERE phone = ? AND status = ? AND expires_at > ?').get(phone, 'active', now);
}

function expireOldUsers() {
  const now = Math.floor(Date.now() / 1000);
  getDb().prepare("UPDATE users SET status = 'expired' WHERE expires_at < ? AND status = 'active'").run(now);
}

/* ── Admin Sessions ─────────────────────────────────────── */
function createAdminSession(id, username) {
  const now = Math.floor(Date.now() / 1000);
  getDb().prepare('INSERT INTO admin_sessions (id, username, created_at, expires_at) VALUES (?, ?, ?, ?)').run(id, username, now, now + 86400);
}

function getAdminSession(id) {
  const now = Math.floor(Date.now() / 1000);
  return getDb().prepare('SELECT * FROM admin_sessions WHERE id = ? AND expires_at > ?').get(id, now);
}

function deleteAdminSession(id) { getDb().prepare('DELETE FROM admin_sessions WHERE id = ?').run(id); }

/* ── Pairing ────────────────────────────────────────────── */
function savePairingRequest(phone, code) {
  getDb().prepare('INSERT INTO pairing_requests (phone, code, status) VALUES (?, ?, ?)').run(phone, code, 'waiting');
}

function updatePairingSession(phone, sessionData) {
  getDb().prepare("UPDATE pairing_requests SET session_data = ?, status = 'done' WHERE phone = ? AND status != 'done'").run(sessionData, phone);
}

function getPairingRequest(phone) {
  return getDb().prepare('SELECT * FROM pairing_requests WHERE phone = ? ORDER BY created_at DESC LIMIT 1').get(phone);
}

/* ── Group Settings ─────────────────────────────────────── */
function getGroupSettings(groupId) {
  const d = getDb();
  let row = d.prepare('SELECT * FROM group_settings WHERE group_id = ?').get(groupId);
  if (!row) {
    d.prepare('INSERT OR IGNORE INTO group_settings (group_id) VALUES (?)').run(groupId);
    row = d.prepare('SELECT * FROM group_settings WHERE group_id = ?').get(groupId);
  }
  return row;
}

function setGroupSetting(groupId, key, value) {
  getDb().prepare(`UPDATE group_settings SET ${key} = ? WHERE group_id = ?`).run(value, groupId);
}

function ensureGroupSettings(groupId) {
  getDb().prepare('INSERT OR IGNORE INTO group_settings (group_id) VALUES (?)').run(groupId);
}

/* ── Antilink warns ─────────────────────────────────────── */
function getWarnCount(phone, groupId) {
  const row = getDb().prepare('SELECT count FROM antilink_warns WHERE phone = ? AND group_id = ?').get(phone, groupId);
  return row ? row.count : 0;
}

function incrementWarn(phone, groupId) {
  const d = getDb();
  d.prepare('INSERT INTO antilink_warns (phone, group_id, count) VALUES (?, ?, 1) ON CONFLICT(phone, group_id) DO UPDATE SET count = count + 1').run(phone, groupId);
  return getWarnCount(phone, groupId);
}

function resetWarns(phone, groupId) {
  getDb().prepare('DELETE FROM antilink_warns WHERE phone = ? AND group_id = ?').run(phone, groupId);
}

module.exports = {
  getDb, addUser, removeUser, getAllUsers, getUser, updateUserStatus,
  updateUserSession, isUserActive, expireOldUsers,
  createAdminSession, getAdminSession, deleteAdminSession,
  savePairingRequest, updatePairingSession, getPairingRequest,
  getGroupSettings, setGroupSetting, ensureGroupSettings,
  getWarnCount, incrementWarn, resetWarns,
};
