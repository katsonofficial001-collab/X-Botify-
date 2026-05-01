'use strict';

require('dotenv').config();
const path = require('path');
const fs = require('fs');

const BOT_NAME = 'Botify X';
const VERSION = 'v1.0.2';

// Ensure required directories exist
['data', 'data/sessions', 'data/auth', 'data/temp'].forEach(d => {
  const full = path.join(__dirname, d);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

console.log(`\n╔══════════════════════════════╗`);
console.log(`║       ${BOT_NAME} ${VERSION}       ║`);
console.log(`║   WhatsApp Bot + Admin Panel  ║`);
console.log(`╚══════════════════════════════╝\n`);

// ── Start admin portal ─────────────────────────────────────────────────────────
const portal = require('./portal/server');
portal.start();

// ── Start WhatsApp bot ─────────────────────────────────────────────────────────
const { startBot } = require('./bot/client');

async function main() {
  const SESSION_ID = process.env.SESSION_ID || '';
  if (!SESSION_ID) {
    console.log(`[${BOT_NAME}] No SESSION_ID set.`);
    console.log(`[${BOT_NAME}] Open the admin portal to generate one, then add SESSION_ID to your Railway variables and redeploy.`);
    console.log(`[${BOT_NAME}] Admin portal is running — waiting for session configuration.`);
    return;
  }

  console.log(`[${BOT_NAME}] Starting WhatsApp connection...`);

  async function tryStart() {
    try {
      await startBot();
    } catch (err) {
      console.error(`[${BOT_NAME}] Fatal bot error:`, err.message);
      console.log(`[${BOT_NAME}] Retrying in 15 seconds...`);
      setTimeout(tryStart, 15000);
    }
  }

  await tryStart();
}

main().catch(err => {
  console.error(`[${BOT_NAME}] Startup error:`, err.message);
  process.exit(1);
});
