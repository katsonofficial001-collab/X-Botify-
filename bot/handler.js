'use strict';

const commands = require('./commands');
const config = require('../config');
const db = require('../portal/db');

const BOT_NAME = 'Botify X';
const PREFIX = () => (process.env.PREFIX || config.PREFIX || '.').trim();

const URL_REGEX = /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|bit\.ly\/[^\s]+|t\.me\/[^\s]+)/gi;

// Cache of recent messages for antidelete: Map<msgId, { from, sender, body, type, buffer? }>
const msgCache = new Map();
const MSG_CACHE_MAX = 200;

function getBody(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  );
}

function getMsgType(msg) {
  const m = msg.message;
  if (!m) return 'unknown';
  return Object.keys(m).filter(k => k !== 'messageContextInfo')[0] || 'unknown';
}

function getQuoted(msg) {
  const m = msg.message;
  if (!m) return null;
  const ctx = m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.stickerMessage?.contextInfo ||
    m.documentMessage?.contextInfo;
  if (!ctx?.quotedMessage) return null;
  return {
    message: ctx.quotedMessage,
    sender: ctx.participant || ctx.remoteJid,
    id: ctx.stanzaId,
    type: Object.keys(ctx.quotedMessage).filter(k => k !== 'messageContextInfo')[0],
  };
}

async function handle(sock, msg) {
  if (msg.key.fromMe) return;

  const from = msg.key.remoteJid;
  if (!from) return;

  const isGroup = from.endsWith('@g.us');
  const sender = isGroup ? (msg.key.participant || msg.key.remoteJid) : msg.key.remoteJid;
  const pushName = msg.pushName || 'User';
  const body = getBody(msg);
  const msgType = getMsgType(msg);
  const quoted = getQuoted(msg);

  const ownerNumber = (config.OWNER_NUMBER || process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
  const senderNumber = sender?.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '') || '';
  const isOwner = ownerNumber && senderNumber === ownerNumber;

  // ── Cache message for antidelete ───────────────────────────────────────────
  if (msg.key.id) {
    if (msgCache.size >= MSG_CACHE_MAX) {
      const firstKey = msgCache.keys().next().value;
      msgCache.delete(firstKey);
    }
    msgCache.set(msg.key.id, { from, sender, senderNumber, body, msgType, pushName, msg });
  }

  // ── Skip status broadcast silently ─────────────────────────────────────────
  if (from === 'status@broadcast') {
    if (isGroup) return;
    // Anti-status-mention: handled per group settings doesn't apply here
    return;
  }

  // ── Group auto-features ────────────────────────────────────────────────────
  if (isGroup) {
    const settings = db.getGroupSettings(from);

    // Anti-link
    if (settings.antilink && !isOwner) {
      const isAdmin = await checkIsAdmin(sock, from, sender);
      if (!isAdmin && URL_REGEX.test(body)) {
        URL_REGEX.lastIndex = 0;
        try {
          await sock.sendMessage(from, { delete: msg.key });
        } catch (_) {}

        const count = db.incrementWarn(senderNumber, from);
        const action = settings.antilink_action || 'warn';

        if (action === 'kick' || count >= 3) {
          await sock.sendMessage(from, {
            text: `🚫 @${senderNumber} was removed for sending links (${count} warning${count > 1 ? 's' : ''}).`,
            mentions: [sender],
          });
          await sock.groupParticipantsUpdate(from, [sender], 'remove').catch(() => {});
          db.resetWarns(senderNumber, from);
        } else {
          await sock.sendMessage(from, {
            text: `⚠️ @${senderNumber}, links are not allowed in this group! Warning *${count}/3*.`,
            mentions: [sender],
          });
        }
        return;
      }
      URL_REGEX.lastIndex = 0;
    }
  }

  // ── Command parsing ────────────────────────────────────────────────────────
  const pref = PREFIX();
  if (!body.startsWith(pref)) return;

  const rawCmd = body.slice(pref.length).trim();
  if (!rawCmd) return;
  const [cmdName, ...args] = rawCmd.split(/\s+/);
  const command = cmdName.toLowerCase();
  const text = args.join(' ');

  const ctx = {
    sock, msg, from, sender, senderNumber, pushName, body,
    command, args, text, isGroup, isOwner, quoted, msgType,
    BOT_NAME, PREFIX: pref,
    reply: async (content) => {
      if (typeof content === 'string') return sock.sendMessage(from, { text: content }, { quoted: msg });
      return sock.sendMessage(from, content, { quoted: msg });
    },
    react: async (emoji) => sock.sendMessage(from, { react: { text: emoji, key: msg.key } }),
    send: async (content) => {
      if (typeof content === 'string') return sock.sendMessage(from, { text: content });
      return sock.sendMessage(from, content);
    },
  };

  const handler = commands.get(command);
  if (!handler) return;

  if (handler.ownerOnly && !isOwner) {
    await ctx.reply(`❌ This command is only for the bot owner.`);
    return;
  }

  if (handler.groupOnly && !isGroup) {
    await ctx.reply(`❌ This command can only be used in groups.`);
    return;
  }

  try {
    await ctx.react('⏳');
    await handler.execute(ctx);
  } catch (err) {
    console.error(`[${BOT_NAME}] Command error (${command}):`, err.message);
    await ctx.reply(`❌ Error: ${err.message}`).catch(() => {});
    await ctx.react('❌').catch(() => {});
  }
}

// ── Handle deleted / edited messages ─────────────────────────────────────────
async function handleMessageUpdate(sock, update) {
  const { key, update: upd } = update;
  const from = key?.remoteJid;
  if (!from || !from.endsWith('@g.us')) return;

  try {
    const settings = db.getGroupSettings(from);

    // Antidelete
    if (settings.antidelete) {
      const isDeleted =
        upd?.message === null ||
        upd?.protocolMessage?.type === 0 ||
        upd?.message?.protocolMessage?.type === 0;

      if (isDeleted && key.id) {
        const cached = msgCache.get(key.id);
        if (cached && cached.body) {
          await sock.sendMessage(from, {
            text:
              `🗑️ *Deleted Message Detected*\n\n` +
              `👤 From: @${cached.senderNumber}\n` +
              `💬 Message: ${cached.body}`,
            mentions: [cached.sender],
          });
        }
      }
    }

    // Antiedit
    if (settings.antiedit) {
      const isEdited = upd?.message?.editedMessage || upd?.editedMessage;
      if (isEdited && key.id) {
        const cached = msgCache.get(key.id);
        const sender = key.participant || from;
        const senderNumber = sender.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
        if (cached) {
          await sock.sendMessage(from, {
            text:
              `✏️ *Message Edited*\n\n` +
              `👤 From: @${senderNumber}\n` +
              `📝 Original: ${cached.body || '(media)'}`,
            mentions: [sender],
          });
        }
      }
    }
  } catch (_) {}
}

// ── Group participant events ───────────────────────────────────────────────────
async function handleGroupUpdate(sock, ev) {
  const { id: groupId, participants, action } = ev;

  let settings;
  try { settings = db.getGroupSettings(groupId); } catch { return; }

  let meta;
  try { meta = await sock.groupMetadata(groupId); } catch { return; }
  const groupName = meta.subject;

  for (const jid of participants) {
    const number = jid.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');

    if (action === 'add' && settings.welcome) {
      const msg = settings.welcome_msg ||
        `👋 Welcome to *${groupName}*, @${number}! 🎉\nI'm *${BOT_NAME}*. Type *.help* for commands.`;
      await sock.sendMessage(groupId, {
        text: msg.replace('@user', `@${number}`).replace('{group}', groupName).replace('{name}', number),
        mentions: [jid],
      }).catch(() => {});
    }

    if (action === 'remove' && settings.bye) {
      const msg = settings.bye_msg ||
        `👋 Goodbye, @${number}! Hope to see you again.`;
      await sock.sendMessage(groupId, {
        text: msg.replace('@user', `@${number}`).replace('{group}', groupName).replace('{name}', number),
        mentions: [jid],
      }).catch(() => {});
    }
  }
}

async function checkIsAdmin(sock, groupId, jid) {
  try {
    const meta = await sock.groupMetadata(groupId);
    return meta.participants.some(p => p.id === jid && (p.admin === 'admin' || p.admin === 'superadmin'));
  } catch { return false; }
}

module.exports = { handle, handleMessageUpdate, handleGroupUpdate };
