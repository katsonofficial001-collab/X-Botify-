require('dotenv').config();

module.exports = {
  SESSION_ID: process.env.SESSION_ID || '',
  BOTNAME: 'Botify X',
  BOT_NAME: 'Botify X',
  bot_name: 'Botify X',
  PREFIX: process.env.PREFIX || '.',
  OWNER_NUMBER: process.env.OWNER_NUMBER || '',
  OWNER_NAME: process.env.OWNER_NAME || 'Admin',
  MODE: process.env.MODE || 'public',
  PORT: process.env.PORT || 3000,
  PORTAL_PORT: process.env.PORTAL_PORT || process.env.PORT || 3000,
  ADMIN_USER: process.env.ADMIN_USER || 'katson',
  ADMIN_PASS: process.env.ADMIN_PASS || '#jesusfuckingchrist#',
  DB_PATH: process.env.DB_PATH || './data/botify.db',
};
