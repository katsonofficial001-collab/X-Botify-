'use strict';

require('dotenv').config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const handler = require('./handler');

const BOT_NAME = 'Botify X';
const VERSION = 'v1.0.2';
const AUTH_DIR = path.join(__dirname, '..', 'data', 'auth');

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

function decodeSession(sessionId) {
  if (!sessionId) return null;
  const match = sessionId.match(/^(?:CYPHER-X|XPLOADER-BOT|BOTIFY-X):~(.+)$/);
  if (!match) return null;
  try { return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')); } catch { return null; }
}

async function restoreSessionFromEnv() {
  const sessionId = process.env.SESSION_ID || '';
  if (!sessionId) return false;
  const credsPath = path.join(AUTH_DIR, 'creds.json');
  if (fs.existsSync(credsPath)) return true; // already have auth files
  const creds = decodeSession(sessionId);
  if (!creds) return false;
  fs.writeFileSync(credsPath, JSON.stringify(creds, null, 2));
  console.log(`[${BOT_NAME}] Session restored from SESSION_ID env var`);
  return true;
}

let retries = 0;
const MAX_RETRIES = 10;
let confirmationSent = false;

async function startBot() {
  await restoreSessionFromEnv();

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
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

  // Make sock globally accessible for handler reuse
  global._botSock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      retries = 0;
      console.log(`\x1b[32m[${BOT_NAME}] ✅ Connected to WhatsApp — ${VERSION}\x1b[0m`);

      // Send confirmation to "Message Yourself" (saved messages) — once only
      if (!confirmationSent) {
        confirmationSent = true;
        const selfJid = sock.user?.id;
        if (selfJid) {
          setTimeout(async () => {
            try {
              await sock.sendMessage(selfJid, {
                text:
                  `✅ *${BOT_NAME} ${VERSION} is now active!*\n\n` +
                  `🤖 Your bot is online and ready to receive commands.\n` +
                  `📋 Send *.help* in any chat to see all commands.\n` +
                  `⚙️ Prefix: *${process.env.PREFIX || '.'}*\n\n` +
                  `_This message was sent to your saved messages to confirm connection._`,
              });
              console.log(`[${BOT_NAME}] Confirmation sent to saved messages.`);
            } catch (_) {}
          }, 3000);
        }
      }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason[code] || code;
      console.log(`[${BOT_NAME}] Connection closed (${reason})`);

      if (code === DisconnectReason.loggedOut) {
        console.log(`[${BOT_NAME}] Logged out. Clearing session. Re-pair via the admin portal.`);
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (_) {}
        fs.mkdirSync(AUTH_DIR, { recursive: true });
        confirmationSent = false;
        setTimeout(startBot, 5000);
        return;
      }

      if (retries < MAX_RETRIES) {
        retries++;
        const delay = Math.min(retries * 5000, 30000);
        console.log(`[${BOT_NAME}] Reconnecting in ${delay / 1000}s... (${retries}/${MAX_RETRIES})`);
        setTimeout(startBot, delay);
      } else {
        console.log(`[${BOT_NAME}] Too many retries. Waiting 2 min before trying again.`);
        retries = 0;
        setTimeout(startBot, 120000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message) continue;
      try { await handler.handle(sock, msg); } catch (err) {
        console.error(`[${BOT_NAME}] Handler error:`, err.message);
      }
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      try { await handler.handleMessageUpdate(sock, update); } catch (_) {}
    }
  });

  sock.ev.on('group-participants.update', async (ev) => {
    try { await handler.handleGroupUpdate(sock, ev); } catch (_) {}
  });

  return sock;
}

module.exports = { startBot };
