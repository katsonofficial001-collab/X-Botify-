'use strict';

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');

if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

const activeSockets = new Map();

function sessionPath(phone) {
  const clean = phone.replace(/[^0-9]/g, '');
  return path.join(SESSIONS_DIR, clean);
}

function encodeCreds(creds) {
  const encoded = Buffer.from(JSON.stringify(creds)).toString('base64');
  return `CYPHER-X:~${encoded}`;
}

async function startPairing(phone) {
  const clean = phone.replace(/[^0-9]/g, '');
  if (!clean || clean.length < 7) {
    throw new Error('Invalid phone number');
  }

  if (activeSockets.has(clean)) {
    const existing = activeSockets.get(clean);
    if (existing.code && existing.status === 'waiting') {
      return { code: existing.code, status: 'waiting' };
    }
    try { existing.sock.end(); } catch (_) {}
    activeSockets.delete(clean);
  }

  const sessDir = sessionPath(clean);
  if (!fs.existsSync(sessDir)) {
    fs.mkdirSync(sessDir, { recursive: true });
  }

  return new Promise(async (resolve, reject) => {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(sessDir);

      const logger = pino({ level: 'silent' });

      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        logger,
        browser: ['Mac OS', 'Safari', '17.0'],
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
      });

      let pairingCode = null;
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { sock.end(); } catch (_) {}
          activeSockets.delete(clean);
          reject(new Error('Pairing timeout — please try again'));
        }
      }, 90000);

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (!pairingCode && !sock.authState.creds.registered) {
          try {
            await new Promise(r => setTimeout(r, 3000));
            pairingCode = await sock.requestPairingCode(clean);
            db.savePairingRequest(clean, pairingCode);
            activeSockets.set(clean, { sock, code: pairingCode, status: 'waiting' });
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve({ code: pairingCode, status: 'waiting' });
            }
          } catch (e) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              try { sock.end(); } catch (_) {}
              activeSockets.delete(clean);
              reject(e);
            }
          }
          return;
        }

        if (connection === 'open') {
          const sessionId = encodeCreds(state.creds);
          db.updatePairingSession(clean, sessionId);
          db.updateUserSession(clean, sessionId);
          activeSockets.set(clean, { sock, code: pairingCode, status: 'connected', sessionId });
        }

        if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode;
          if (code !== DisconnectReason.loggedOut) {
            activeSockets.delete(clean);
          }
        }
      });

    } catch (err) {
      reject(err);
    }
  });
}

function getPairingStatus(phone) {
  const clean = phone.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(clean);
  if (!socket) {
    const req = db.getPairingRequest(clean);
    if (req && req.status === 'done') {
      return { status: 'connected', sessionId: req.session_data };
    }
    return { status: 'idle' };
  }
  return {
    status: socket.status,
    code: socket.code,
    sessionId: socket.sessionId,
  };
}

function disconnectSession(phone) {
  const clean = phone.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(clean);
  if (socket) {
    try { socket.sock.end(); } catch (_) {}
    activeSockets.delete(clean);
  }
  const sessDir = sessionPath(clean);
  if (fs.existsSync(sessDir)) {
    fs.rmSync(sessDir, { recursive: true, force: true });
  }
}

module.exports = { startPairing, getPairingStatus, disconnectSession };
