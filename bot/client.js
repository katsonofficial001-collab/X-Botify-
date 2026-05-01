'use strict';

require('dotenv').config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const handler = require('./handler');

const BOT_NAME = 'Botify X';
const VERSION = 'v1.0.2';
const SESS_DIR = path.join(__dirname, '..', 'data', 'auth');

if (!fs.existsSync(SESS_DIR)) {
  fs.mkdirSync(SESS_DIR, { recursive: true });
}

function decodeSession(sessionId) {
  if (!sessionId) return null;
  const match = sessionId.match(/^(?:CYPHER-X|XPLOADER-BOT|BOTIFY-X):~(.+)$/);
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

async function restoreSession(sessDir, sessionId) {
  const creds = decodeSession(sessionId);
  if (!creds) return;
  const credsPath = path.join(sessDir, 'creds.json');
  if (!fs.existsSync(credsPath)) {
    fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2));
    console.log(`[${BOT_NAME}] Session restored from SESSION_ID`);
  }
}

let retries = 0;
const MAX_RETRIES = 10;

async function startBot() {
  const SESSION_ID = process.env.SESSION_ID || '';

  if (SESSION_ID) {
    await restoreSession(SESS_DIR, SESSION_ID);
  } else {
    console.log(`[${BOT_NAME}] No SESSION_ID — generate one via the admin portal.`);
  }

  const { state, saveCreds } = await useMultiFileAuthState(SESS_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({
    version: [2, 3000, 1023531901],
  }));

  const logger = pino({ level: 'silent' });

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger,
    browser: ['Mac OS', 'Safari', '17.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (connection === 'open') {
      retries = 0;
      console.log(`\x1b[32m[${BOT_NAME}] Connected to WhatsApp! ${VERSION}\x1b[0m`);
      console.log(`\x1b[32m[${BOT_NAME}] Bot is active and ready.\x1b[0m`);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason[code] || code;
      console.log(`[${BOT_NAME}] Connection closed (${reason})`);

      if (code === DisconnectReason.loggedOut) {
        console.log(`[${BOT_NAME}] Logged out. Please generate a new session via the portal.`);
        try { fs.rmSync(SESS_DIR, { recursive: true, force: true }); } catch (_) {}
        fs.mkdirSync(SESS_DIR, { recursive: true });
        setTimeout(startBot, 5000);
        return;
      }

      if (retries < MAX_RETRIES) {
        retries++;
        const delay = Math.min(retries * 5000, 30000);
        console.log(`[${BOT_NAME}] Reconnecting in ${delay / 1000}s... (attempt ${retries}/${MAX_RETRIES})`);
        setTimeout(startBot, delay);
      } else {
        console.log(`[${BOT_NAME}] Max retries reached. Waiting 2 minutes before trying again.`);
        retries = 0;
        setTimeout(startBot, 120000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message) continue;
      try {
        await handler.handle(sock, msg);
      } catch (err) {
        console.error(`[${BOT_NAME}] Handler error:`, err.message);
      }
    }
  });

  sock.ev.on('group-participants.update', async (ev) => {
    try {
      await handler.handleGroupUpdate(sock, ev);
    } catch (_) {}
  });

  return sock;
}

module.exports = { startBot };
