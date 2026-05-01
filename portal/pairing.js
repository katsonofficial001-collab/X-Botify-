'use strict';

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const AUTH_DIR = path.join(__dirname, '..', 'data', 'auth');
const SESSIONS_DIR = path.join(__dirname, '..', 'data', 'sessions');

[AUTH_DIR, SESSIONS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const activeSockets = new Map();

// Called by bot/client.js to notify portal when bot connects
let botReadyCallback = null;
function onBotReady(cb) { botReadyCallback = cb; }

function notifyBotReady(phone) {
  if (botReadyCallback) botReadyCallback(phone);
}

// Signal the main process to (re)start the bot
const TRIGGER_FILE = path.join(__dirname, '..', 'data', '.start_bot');
function triggerBotStart() {
  fs.writeFileSync(TRIGGER_FILE, String(Date.now()));
}

async function startPairing(phone) {
  const clean = phone.replace(/[^0-9]/g, '');
  if (!clean || clean.length < 7) throw new Error('Invalid phone number');

  // Tear down existing attempt for this number
  if (activeSockets.has(clean)) {
    try { activeSockets.get(clean).sock.end(); } catch (_) {}
    activeSockets.delete(clean);
  }

  const sessDir = path.join(SESSIONS_DIR, clean);
  if (!fs.existsSync(sessDir)) fs.mkdirSync(sessDir, { recursive: true });

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
        const { connection, lastDisconnect } = update;

        // Request pairing code on first connect attempt
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
          // ── Pairing succeeded ──────────────────────────────────────────────
          // Copy session files to the main auth directory
          try {
            const files = fs.readdirSync(sessDir);
            for (const file of files) {
              fs.copyFileSync(path.join(sessDir, file), path.join(AUTH_DIR, file));
            }
          } catch (_) {}

          // Encode SESSION_ID for display / backup
          let sessionId = '';
          try {
            const credsPath = path.join(sessDir, 'creds.json');
            if (fs.existsSync(credsPath)) {
              const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
              sessionId = `CYPHER-X:~${Buffer.from(JSON.stringify(creds)).toString('base64')}`;
            }
          } catch (_) {}

          db.updatePairingSession(clean, sessionId);
          db.updateUserSession(clean, sessionId);
          activeSockets.set(clean, { sock, code: pairingCode, status: 'connected', sessionId });

          // Tell the main process to start the bot now
          triggerBotStart();

          // Disconnect this temporary pairing socket — bot/client.js will take over
          setTimeout(() => {
            try { sock.end(); } catch (_) {}
          }, 2000);
        }

        if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode;
          if (code !== DisconnectReason.loggedOut) activeSockets.delete(clean);
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
    if (req && req.status === 'done') return { status: 'connected', sessionId: req.session_data };
    return { status: 'idle' };
  }
  return { status: socket.status, code: socket.code, sessionId: socket.sessionId };
}

function disconnectSession(phone) {
  const clean = phone.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(clean);
  if (socket) { try { socket.sock.end(); } catch (_) {} activeSockets.delete(clean); }
}

module.exports = { startPairing, getPairingStatus, disconnectSession, onBotReady, triggerBotStart, TRIGGER_FILE };
