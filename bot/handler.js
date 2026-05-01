'use strict';

const commands = require('./commands');
const config = require('../config');

const BOT_NAME = 'Botify X';
const PREFIX = (config.PREFIX || process.env.PREFIX || '.').trim();

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
    m.templateButtonReplyMessage?.selectedId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  );
}

function getMsgType(msg) {
  const m = msg.message;
  if (!m) return 'unknown';
  const keys = Object.keys(m).filter(k => k !== 'messageContextInfo');
  return keys[0] || 'unknown';
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
  const isGroup = from?.endsWith('@g.us');
  const sender = isGroup ? msg.key.participant : msg.key.remoteJid;
  const pushName = msg.pushName || 'User';
  const body = getBody(msg);
  const msgType = getMsgType(msg);
  const quoted = getQuoted(msg);

  const ownerNumber = (config.OWNER_NUMBER || process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
  const senderNumber = sender?.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '') || '';
  const isOwner = ownerNumber && senderNumber === ownerNumber;

  if (!body.startsWith(PREFIX)) return;

  const rawCmd = body.slice(PREFIX.length).trim();
  const [cmdName, ...args] = rawCmd.split(/\s+/);
  const command = cmdName.toLowerCase();
  const text = args.join(' ');

  const ctx = {
    sock,
    msg,
    from,
    sender,
    senderNumber,
    pushName,
    body,
    command,
    args,
    text,
    isGroup,
    isOwner,
    quoted,
    msgType,
    BOT_NAME,
    PREFIX,
    reply: async (content) => {
      if (typeof content === 'string') {
        return sock.sendMessage(from, { text: content }, { quoted: msg });
      }
      return sock.sendMessage(from, content, { quoted: msg });
    },
    react: async (emoji) => {
      return sock.sendMessage(from, {
        react: { text: emoji, key: msg.key }
      });
    },
    send: async (content) => {
      if (typeof content === 'string') {
        return sock.sendMessage(from, { text: content });
      }
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
    return;
  }
}

async function handleGroupUpdate(sock, ev) {
  const { id: groupId, participants, action } = ev;
  if (action === 'add') {
    for (const jid of participants) {
      try {
        const meta = await sock.groupMetadata(groupId);
        await sock.sendMessage(groupId, {
          text: `👋 Welcome to *${meta.subject}*!\nI'm *${BOT_NAME}*. Type *${PREFIX}help* for commands.`,
        });
      } catch (_) {}
    }
  }
}

module.exports = { handle, handleGroupUpdate };
