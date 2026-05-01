'use strict';

const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const pairing = require('./pairing');

const ADMIN_USER = process.env.ADMIN_USER || 'katson';
const ADMIN_PASS = process.env.ADMIN_PASS || '#jesusfuckingchrist#';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function createPortalApp() {
  const app = express();

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
    },
  }));

  function requireAdmin(req, res, next) {
    if (req.session && req.session.admin === true) {
      return next();
    }
    res.redirect('/login');
  }

  // ─── Auth routes ─────────────────────────────────────────────────────────────

  app.get('/', (req, res) => {
    if (req.session && req.session.admin) return res.redirect('/admin');
    res.redirect('/login');
  });

  app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  });

  app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      req.session.admin = true;
      req.session.username = username;
      return res.redirect('/admin');
    }
    res.redirect('/login?error=1');
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });

  // ─── Admin panel ──────────────────────────────────────────────────────────────

  app.get('/admin', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  });

  // ─── API ─────────────────────────────────────────────────────────────────────

  app.get('/api/users', requireAdmin, (req, res) => {
    db.expireOldUsers();
    const users = db.getAllUsers();
    const now = Math.floor(Date.now() / 1000);
    const enriched = users.map(u => ({
      ...u,
      daysLeft: Math.max(0, Math.ceil((u.expires_at - now) / 86400)),
      expired: u.expires_at < now,
    }));
    res.json(enriched);
  });

  app.post('/api/users', requireAdmin, (req, res) => {
    const { phone, name, notes } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    const clean = phone.replace(/[^0-9]/g, '');
    if (!clean || clean.length < 7) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }
    const result = db.addUser({ phone: clean, name: name || '', notes: notes || '' });
    res.json(result);
  });

  app.delete('/api/users/:phone', requireAdmin, (req, res) => {
    const { phone } = req.params;
    db.removeUser(phone);
    pairing.disconnectSession(phone);
    res.json({ success: true });
  });

  app.post('/api/users/:phone/revoke', requireAdmin, (req, res) => {
    const { phone } = req.params;
    db.updateUserStatus(phone, 'revoked');
    pairing.disconnectSession(phone);
    res.json({ success: true });
  });

  app.post('/api/users/:phone/renew', requireAdmin, (req, res) => {
    const { phone } = req.params;
    db.addUser({ phone, name: '', notes: 'Renewed' });
    res.json({ success: true });
  });

  // ─── Pairing routes ───────────────────────────────────────────────────────────

  app.post('/api/pair', requireAdmin, async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    const clean = phone.replace(/[^0-9]/g, '');
    try {
      const result = await pairing.startPairing(clean);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/pair/status/:phone', requireAdmin, (req, res) => {
    const { phone } = req.params;
    const status = pairing.getPairingStatus(phone);
    res.json(status);
  });

  // ─── Health check ─────────────────────────────────────────────────────────────

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', bot: 'Botify X', version: '1.0.2' });
  });

  return app;
}

function start() {
  const PORT = process.env.PORT || 3000;
  const app = createPortalApp();
  app.listen(PORT, () => {
    console.log(`\x1b[32m[Botify X Portal]\x1b[0m Admin portal running at http://localhost:${PORT}`);
  });
}

module.exports = { createPortalApp, start };
