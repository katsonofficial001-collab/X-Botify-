'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs');

const BOT_NAME = 'Botify X';
const VERSION = 'v1.0.2';

// Ensure directories
['data', 'data/sessions', 'data/auth', 'data/temp'].forEach(d => {
  const full = path.join(__dirname, d);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

console.log(`\n╔══════════════════════════════╗`);
console.log(`║       ${BOT_NAME} ${VERSION}       ║`);
console.log(`║   WhatsApp Bot + Admin Panel  ║`);
console.log(`╚══════════════════════════════╝\n`);

// ── Start admin portal ────────────────────────────────────────────────────────
const portal = require('./portal/server');
portal.start();

// ── Bot management ────────────────────────────────────────────────────────────
const { TRIGGER_FILE } = require('./portal/pairing');
const AUTH_DIR = path.join(__dirname, 'data', 'auth');

let botStarted = false;

function hasAuthFiles() {
  return fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
}

function hasSessionEnv() {
  const s = process.env.SESSION_ID || '';
  return s.length > 10;
}

async function launchBot() {
  if (botStarted) return;
  botStarted = true;
  console.log(`[${BOT_NAME}] Starting WhatsApp bot...`);
  const { startBot } = require('./bot/client');
  try {
    await startBot();
  } catch (err) {
    console.error(`[${BOT_NAME}] Bot error:`, err.message);
    botStarted = false;
    setTimeout(launchBot, 15000);
  }
}

// Watch for the trigger file written by pairing portal
function watchForPairingTrigger() {
  let lastMtime = fs.existsSync(TRIGGER_FILE)
    ? fs.statSync(TRIGGER_FILE).mtimeMs
    : 0;

  setInterval(() => {
    if (botStarted) return;
    if (fs.existsSync(TRIGGER_FILE)) {
      const mtime = fs.statSync(TRIGGER_FILE).mtimeMs;
      if (mtime !== lastMtime) {
        lastMtime = mtime;
        console.log(`[${BOT_NAME}] Pairing complete — starting bot...`);
        setTimeout(launchBot, 2000);
      }
    }
  }, 3000);
}

// Start immediately if session already available
if (hasAuthFiles() || hasSessionEnv()) {
  launchBot();
} else {
  console.log(`[${BOT_NAME}] No session found. Open the admin portal to pair WhatsApp.`);
  watchForPairingTrigger();
}
