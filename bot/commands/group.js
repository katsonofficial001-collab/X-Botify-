'use strict';

const db = require('../../portal/db');

async function getBotId(sock) {
  return (sock.user?.id || '').replace(/:.*$/, '') + '@s.whatsapp.net';
}

async function isBotAdmin(sock, groupId) {
  const botId = await getBotId(sock);
  const meta = await sock.groupMetadata(groupId);
  return meta.participants.some(p => p.id === botId && (p.admin === 'admin' || p.admin === 'superadmin'));
}

async function isAdmin(sock, groupId, jid) {
  const meta = await sock.groupMetadata(groupId);
  return meta.participants.some(p => p.id === jid && (p.admin === 'admin' || p.admin === 'superadmin'));
}

function toggleHelp(name, on, off) {
  return `Usage: .${name} on | off\n${on}\n${off}`;
}

module.exports = {

  // ─── Anti-link ────────────────────────────────────────────────────────────
  antilink: {
    description: 'Toggle anti-link protection',
    groupOnly: true,
    async execute(ctx) {
      const { from, text, isOwner } = ctx;
      if (!isOwner && !await isAdmin(ctx.sock, from, ctx.sender)) {
        return ctx.reply('❌ Only admins can toggle antilink.');
      }
      const arg = text.toLowerCase();
      if (!['on', 'off', 'kick', 'warn'].includes(arg)) {
        return ctx.reply(`${toggleHelp('antilink', '🔗 on — warn user after 3 links → kick', '🔗 off — disable')}\n• .antilink kick — kick on first link`);
      }
      const s = db.getGroupSettings(from);
      db.ensureGroupSettings(from);
      if (arg === 'on') {
        db.setGroupSetting(from, 'antilink', 1);
        db.setGroupSetting(from, 'antilink_action', 'warn');
        return ctx.reply('🔗 *Anti-link enabled* — warn mode (3 warnings → kick).');
      } else if (arg === 'kick') {
        db.setGroupSetting(from, 'antilink', 1);
        db.setGroupSetting(from, 'antilink_action', 'kick');
        return ctx.reply('🔗 *Anti-link enabled* — instant kick mode.');
      } else {
        db.setGroupSetting(from, 'antilink', 0);
        return ctx.reply('🔗 *Anti-link disabled.*');
      }
    },
  },

  // ─── Anti-delete ─────────────────────────────────────────────────────────
  antidelete: {
    description: 'Re-send deleted messages',
    groupOnly: true,
    async execute(ctx) {
      const { from, text, isOwner } = ctx;
      if (!isOwner && !await isAdmin(ctx.sock, from, ctx.sender)) {
        return ctx.reply('❌ Only admins can toggle antidelete.');
      }
      const arg = text.toLowerCase();
      if (!['on', 'off'].includes(arg)) return ctx.reply(toggleHelp('antidelete', '🗑️ on', '🗑️ off'));
      db.ensureGroupSettings(from);
      db.setGroupSetting(from, 'antidelete', arg === 'on' ? 1 : 0);
      return ctx.reply(`🗑️ *Anti-delete ${arg === 'on' ? 'enabled — deleted messages will be re-sent' : 'disabled'}.*`);
    },
  },

  // ─── Anti-edit ───────────────────────────────────────────────────────────
  antiedit: {
    description: 'Show original content of edited messages',
    groupOnly: true,
    async execute(ctx) {
      const { from, text, isOwner } = ctx;
      if (!isOwner && !await isAdmin(ctx.sock, from, ctx.sender)) {
        return ctx.reply('❌ Only admins can toggle antiedit.');
      }
      const arg = text.toLowerCase();
      if (!['on', 'off'].includes(arg)) return ctx.reply(toggleHelp('antiedit', '✏️ on', '✏️ off'));
      db.ensureGroupSettings(from);
      db.setGroupSetting(from, 'antiedit', arg === 'on' ? 1 : 0);
      return ctx.reply(`✏️ *Anti-edit ${arg === 'on' ? 'enabled — original message shown when edited' : 'disabled'}.*`);
    },
  },

  // ─── Welcome ─────────────────────────────────────────────────────────────
  welcome: {
    description: 'Toggle welcome message when someone joins',
    aliases: ['setwelcome'],
    groupOnly: true,
    async execute(ctx) {
      const { from, text, isOwner } = ctx;
      if (!isOwner && !await isAdmin(ctx.sock, from, ctx.sender)) {
        return ctx.reply('❌ Only admins can set the welcome message.');
      }
      db.ensureGroupSettings(from);

      if (!text) {
        const s = db.getGroupSettings(from);
        return ctx.reply(
          `👋 *Welcome Message*\n\n` +
          `Status: ${s.welcome ? '*Enabled ✅*' : '*Disabled ❌*'}\n` +
          `Message: ${s.welcome_msg || '_(default)_'}\n\n` +
          `Usage:\n` +
          `.welcome on\n` +
          `.welcome off\n` +
          `.welcome set Your message here. Use @user for the member's name and {group} for group name.`
        );
      }

      const [cmd, ...rest] = text.split(' ');
      if (cmd === 'on') {
        db.setGroupSetting(from, 'welcome', 1);
        return ctx.reply('👋 *Welcome message enabled.*');
      } else if (cmd === 'off') {
        db.setGroupSetting(from, 'welcome', 0);
        return ctx.reply('👋 *Welcome message disabled.*');
      } else if (cmd === 'set' && rest.length) {
        db.setGroupSetting(from, 'welcome', 1);
        db.setGroupSetting(from, 'welcome_msg', rest.join(' '));
        return ctx.reply(`👋 *Welcome message set!*\n\n_${rest.join(' ')}_`);
      } else {
        return ctx.reply('Usage: .welcome on | off | set [message]\nVariables: @user, {group}');
      }
    },
  },

  // ─── Bye / Left ──────────────────────────────────────────────────────────
  bye: {
    description: 'Toggle goodbye message when someone leaves',
    aliases: ['setbye', 'left', 'goodbye'],
    groupOnly: true,
    async execute(ctx) {
      const { from, text, isOwner } = ctx;
      if (!isOwner && !await isAdmin(ctx.sock, from, ctx.sender)) {
        return ctx.reply('❌ Only admins can set the goodbye message.');
      }
      db.ensureGroupSettings(from);

      if (!text) {
        const s = db.getGroupSettings(from);
        return ctx.reply(
          `🚪 *Goodbye Message*\n\n` +
          `Status: ${s.bye ? '*Enabled ✅*' : '*Disabled ❌*'}\n` +
          `Message: ${s.bye_msg || '_(default)_'}\n\n` +
          `Usage:\n.bye on | off | set [message]\nVariables: @user, {group}`
        );
      }

      const [cmd, ...rest] = text.split(' ');
      if (cmd === 'on') {
        db.setGroupSetting(from, 'bye', 1);
        return ctx.reply('🚪 *Goodbye message enabled.*');
      } else if (cmd === 'off') {
        db.setGroupSetting(from, 'bye', 0);
        return ctx.reply('🚪 *Goodbye message disabled.*');
      } else if (cmd === 'set' && rest.length) {
        db.setGroupSetting(from, 'bye', 1);
        db.setGroupSetting(from, 'bye_msg', rest.join(' '));
        return ctx.reply(`🚪 *Goodbye message set!*\n\n_${rest.join(' ')}_`);
      } else {
        return ctx.reply('Usage: .bye on | off | set [message]');
      }
    },
  },

  // ─── Hidetag ─────────────────────────────────────────────────────────────
  hidetag: {
    description: 'Tag all silently (no name visible)',
    aliases: ['htag', 'stag', 'siltag'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, msg, text, isOwner } = ctx;
      if (!isOwner && !await isAdmin(sock, from, ctx.sender)) {
        return ctx.reply('❌ Only admins can use hidetag.');
      }

      const meta = await sock.groupMetadata(from);
      const mentions = meta.participants.map(p => p.id);
      await sock.sendMessage(from, {
        text: text || `📢 *${ctx.BOT_NAME}*`,
        mentions,
      }, { quoted: msg });
    },
  },

  // ─── Tagall ──────────────────────────────────────────────────────────────
  tagall: {
    description: 'Tag all group members',
    aliases: ['mentionall', 'everyone', 'all'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, msg, text, isOwner } = ctx;
      if (!isOwner && !await isAdmin(sock, from, ctx.sender)) {
        return ctx.reply('❌ Only admins can use tagall.');
      }
      const meta = await sock.groupMetadata(from);
      const mentions = meta.participants.map(p => p.id);
      const tagText = mentions.map(m => `@${m.split('@')[0]}`).join(' ');
      await sock.sendMessage(from, {
        text: text ? `📢 ${text}\n\n${tagText}` : `📢 *${ctx.BOT_NAME}*\n\n${tagText}`,
        mentions,
      }, { quoted: msg });
    },
  },

  // ─── Anti-status-mention ─────────────────────────────────────────────────
  antistatusmention: {
    description: 'Ignore status view mentions in group',
    aliases: ['antistatus'],
    groupOnly: true,
    async execute(ctx) {
      const { from, text, isOwner } = ctx;
      if (!isOwner && !await isAdmin(ctx.sock, from, ctx.sender)) {
        return ctx.reply('❌ Only admins can toggle this setting.');
      }
      db.ensureGroupSettings(from);
      const arg = text.toLowerCase();
      if (!['on', 'off'].includes(arg)) return ctx.reply(toggleHelp('antistatusmention', '🔕 on', '🔕 off'));
      db.setGroupSetting(from, 'antistatusmention', arg === 'on' ? 1 : 0);
      return ctx.reply(`🔕 *Anti-status-mention ${arg === 'on' ? 'enabled' : 'disabled'}.*`);
    },
  },

  // ─── Group settings overview ──────────────────────────────────────────────
  groupsettings: {
    description: 'Show all group auto-features',
    aliases: ['gsettings', 'features', 'settings'],
    groupOnly: true,
    async execute(ctx) {
      const { from } = ctx;
      db.ensureGroupSettings(from);
      const s = db.getGroupSettings(from);
      const on = '✅', off = '❌';
      return ctx.reply(
        `⚙️ *Group Settings for this group:*\n\n` +
        `🔗 Anti-link: ${s.antilink ? on : off} ${s.antilink ? `(${s.antilink_action})` : ''}\n` +
        `🗑️ Anti-delete: ${s.antidelete ? on : off}\n` +
        `✏️ Anti-edit: ${s.antiedit ? on : off}\n` +
        `🔕 Anti-status-mention: ${s.antistatusmention ? on : off}\n` +
        `👋 Welcome: ${s.welcome ? on : off}\n` +
        `🚪 Goodbye: ${s.bye ? on : off}\n\n` +
        `_Use .antilink on|off, .antidelete on|off, .welcome on|off, etc. to toggle._`
      );
    },
  },

  // ─── Kick ────────────────────────────────────────────────────────────────
  kick: {
    description: 'Remove a member from the group',
    aliases: ['remove', 'ban'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, msg, isOwner } = ctx;
      if (!isOwner && !await isAdmin(sock, from, ctx.sender)) return ctx.reply('❌ Only admins can remove members.');
      if (!await isBotAdmin(sock, from)) return ctx.reply('❌ I need admin privileges to remove members.');
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentioned.length) return ctx.reply(`❌ Usage: ${ctx.PREFIX}kick @user`);

      const meta = await sock.groupMetadata(from);
      for (const jid of mentioned) {
        if (await isAdmin(sock, from, jid)) {
          await sock.sendMessage(from, { text: `❌ Cannot kick an admin.` });
          continue;
        }
        await sock.groupParticipantsUpdate(from, [jid], 'remove');
        await sock.sendMessage(from, { text: `✅ @${jid.split('@')[0]} removed.`, mentions: [jid] });
      }
    },
  },

  // ─── Promote ─────────────────────────────────────────────────────────────
  promote: {
    description: 'Promote a member to admin',
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, msg, isOwner } = ctx;
      if (!isOwner && !await isAdmin(sock, from, ctx.sender)) return ctx.reply('❌ Only admins can promote members.');
      if (!await isBotAdmin(sock, from)) return ctx.reply('❌ I need admin privileges.');
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentioned.length) return ctx.reply(`❌ Usage: ${ctx.PREFIX}promote @user`);
      for (const jid of mentioned) {
        await sock.groupParticipantsUpdate(from, [jid], 'promote');
        await sock.sendMessage(from, { text: `✅ @${jid.split('@')[0]} is now an admin.`, mentions: [jid] });
      }
    },
  },

  // ─── Demote ──────────────────────────────────────────────────────────────
  demote: {
    description: 'Remove admin from a member',
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, msg, isOwner } = ctx;
      if (!isOwner && !await isAdmin(sock, from, ctx.sender)) return ctx.reply('❌ Only admins can demote members.');
      if (!await isBotAdmin(sock, from)) return ctx.reply('❌ I need admin privileges.');
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentioned.length) return ctx.reply(`❌ Usage: ${ctx.PREFIX}demote @user`);
      for (const jid of mentioned) {
        await sock.groupParticipantsUpdate(from, [jid], 'demote');
        await sock.sendMessage(from, { text: `✅ @${jid.split('@')[0]} is no longer an admin.`, mentions: [jid] });
      }
    },
  },

  // ─── Mute / Unmute ───────────────────────────────────────────────────────
  mute: {
    description: 'Mute the group',
    aliases: ['mutegroup'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, isOwner } = ctx;
      if (!isOwner && !await isAdmin(sock, from, ctx.sender)) return ctx.reply('❌ Only admins can mute.');
      if (!await isBotAdmin(sock, from)) return ctx.reply('❌ I need admin privileges.');
      await sock.groupSettingUpdate(from, 'announcement');
      return ctx.reply('🔇 *Group muted* — only admins can send messages.');
    },
  },

  unmute: {
    description: 'Unmute the group',
    aliases: ['unmutegroup', 'opengroup'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, isOwner } = ctx;
      if (!isOwner && !await isAdmin(sock, from, ctx.sender)) return ctx.reply('❌ Only admins can unmute.');
      if (!await isBotAdmin(sock, from)) return ctx.reply('❌ I need admin privileges.');
      await sock.groupSettingUpdate(from, 'not_announcement');
      return ctx.reply('🔊 *Group unmuted* — everyone can send messages.');
    },
  },

  // ─── Group info ───────────────────────────────────────────────────────────
  groupinfo: {
    description: 'Show group information',
    aliases: ['ginfo'],
    groupOnly: true,
    async execute(ctx) {
      const meta = await ctx.sock.groupMetadata(ctx.from);
      const admins = meta.participants.filter(p => p.admin);
      const created = new Date(meta.creation * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      return ctx.reply(
        `📋 *Group Info*\n\n` +
        `📛 Name: *${meta.subject}*\n👥 Members: *${meta.participants.length}*\n` +
        `👑 Admins: *${admins.length}*\n📅 Created: *${created}*\n` +
        `${meta.desc ? `\n📝 Description:\n${meta.desc}` : ''}`
      );
    },
  },

  // ─── Invite link ─────────────────────────────────────────────────────────
  link: {
    description: 'Get group invite link',
    aliases: ['invitelink', 'grouplink'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, isOwner } = ctx;
      if (!isOwner && !await isAdmin(sock, from, ctx.sender)) return ctx.reply('❌ Only admins can get the invite link.');
      if (!await isBotAdmin(sock, from)) return ctx.reply('❌ I need admin privileges.');
      const code = await sock.groupInviteCode(from);
      return ctx.reply(`🔗 *Invite Link*\n\nhttps://chat.whatsapp.com/${code}`);
    },
  },

  // ─── Warn ─────────────────────────────────────────────────────────────────
  warn: {
    description: 'Warn a user',
    aliases: ['warning'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, msg, isOwner } = ctx;
      if (!isOwner && !await isAdmin(sock, from, ctx.sender)) return ctx.reply('❌ Only admins can warn members.');
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentioned.length) return ctx.reply(`❌ Usage: ${ctx.PREFIX}warn @user [reason]`);
      const reason = ctx.text.replace(/<@\d+>/g, '').trim() || 'No reason given';
      for (const jid of mentioned) {
        const num = jid.split('@')[0];
        const count = db.incrementWarn(num, from);
        await sock.sendMessage(from, {
          text: `⚠️ *Warning ${count}/3* for @${num}\n📝 Reason: ${reason}`,
          mentions: [jid],
        });
        if (count >= 3) {
          await sock.sendMessage(from, { text: `🚫 @${num} reached 3 warnings and was removed.`, mentions: [jid] });
          await sock.groupParticipantsUpdate(from, [jid], 'remove').catch(() => {});
          db.resetWarns(num, from);
        }
      }
    },
  },

  // ─── Reset warns ──────────────────────────────────────────────────────────
  resetwarn: {
    description: 'Reset warnings for a user',
    aliases: ['clearwarn', 'unwarn'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, msg, isOwner } = ctx;
      if (!isOwner && !await isAdmin(sock, from, ctx.sender)) return ctx.reply('❌ Only admins can reset warnings.');
      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      if (!mentioned.length) return ctx.reply(`❌ Usage: ${ctx.PREFIX}resetwarn @user`);
      for (const jid of mentioned) {
        const num = jid.split('@')[0];
        db.resetWarns(num, from);
        await sock.sendMessage(from, { text: `✅ Warnings reset for @${num}.`, mentions: [jid] });
      }
    },
  },
};
