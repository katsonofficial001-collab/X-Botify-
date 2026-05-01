'use strict';

async function getBotId(sock) {
  return sock.user?.id?.replace(/:.*$/, '') + '@s.whatsapp.net';
}

async function isBotAdmin(sock, groupId) {
  const botId = await getBotId(sock);
  const meta = await sock.groupMetadata(groupId);
  return meta.participants.some(p => p.id === botId && (p.admin === 'admin' || p.admin === 'superadmin'));
}

async function isAdmin(meta, jid) {
  return meta.participants.some(p => p.id === jid && (p.admin === 'admin' || p.admin === 'superadmin'));
}

module.exports = {
  tagall: {
    description: 'Tag all group members',
    aliases: ['mentionall', 'everyone', 'all'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, msg, text, BOT_NAME, isOwner } = ctx;

      if (!isOwner) {
        const meta = await sock.groupMetadata(from);
        const isUserAdmin = await isAdmin(meta, ctx.sender);
        if (!isUserAdmin) {
          await ctx.reply('❌ Only group admins can use tagall.');
          return;
        }
      }

      const meta = await sock.groupMetadata(from);
      const members = meta.participants.map(p => p.id);
      const mentions = members;
      const tagText = members.map(m => `@${m.split('@')[0]}`).join(' ');
      const message = text ? `📢 ${text}\n\n${tagText}` : `📢 *${BOT_NAME}*\n\n${tagText}`;

      await sock.sendMessage(from, {
        text: message,
        mentions,
      }, { quoted: msg });
    },
  },

  kick: {
    description: 'Remove a member from the group',
    aliases: ['remove', 'ban'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, msg, isOwner } = ctx;

      const meta = await sock.groupMetadata(from);
      const botAdmin = await isBotAdmin(sock, from);
      const isUserAdmin = await isAdmin(meta, ctx.sender);

      if (!isUserAdmin && !isOwner) {
        await ctx.reply('❌ Only admins can remove members.');
        return;
      }

      if (!botAdmin) {
        await ctx.reply('❌ I need admin privileges to remove members.');
        return;
      }

      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
      if (!mentioned?.length) {
        await ctx.reply(`❌ Usage: ${ctx.PREFIX}kick @user`);
        return;
      }

      for (const jid of mentioned) {
        const targetAdmin = await isAdmin(meta, jid);
        if (targetAdmin) {
          await ctx.reply(`❌ Cannot remove an admin: @${jid.split('@')[0]}`, { mentions: [jid] });
          continue;
        }
        await sock.groupParticipantsUpdate(from, [jid], 'remove');
        await sock.sendMessage(from, {
          text: `✅ @${jid.split('@')[0]} has been removed.`,
          mentions: [jid],
        });
      }
    },
  },

  promote: {
    description: 'Promote a member to admin',
    aliases: ['makeadmin'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, msg, isOwner } = ctx;

      const meta = await sock.groupMetadata(from);
      const botAdmin = await isBotAdmin(sock, from);
      const isUserAdmin = await isAdmin(meta, ctx.sender);

      if (!isUserAdmin && !isOwner) {
        await ctx.reply('❌ Only admins can promote members.');
        return;
      }

      if (!botAdmin) {
        await ctx.reply('❌ I need admin privileges to promote members.');
        return;
      }

      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
      if (!mentioned?.length) {
        await ctx.reply(`❌ Usage: ${ctx.PREFIX}promote @user`);
        return;
      }

      for (const jid of mentioned) {
        await sock.groupParticipantsUpdate(from, [jid], 'promote');
        await sock.sendMessage(from, {
          text: `✅ @${jid.split('@')[0]} has been promoted to admin.`,
          mentions: [jid],
        });
      }
    },
  },

  demote: {
    description: 'Remove admin status from a member',
    aliases: ['removeadmin'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, msg, isOwner } = ctx;

      const meta = await sock.groupMetadata(from);
      const botAdmin = await isBotAdmin(sock, from);
      const isUserAdmin = await isAdmin(meta, ctx.sender);

      if (!isUserAdmin && !isOwner) {
        await ctx.reply('❌ Only admins can demote members.');
        return;
      }

      if (!botAdmin) {
        await ctx.reply('❌ I need admin privileges to demote members.');
        return;
      }

      const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
      if (!mentioned?.length) {
        await ctx.reply(`❌ Usage: ${ctx.PREFIX}demote @user`);
        return;
      }

      for (const jid of mentioned) {
        await sock.groupParticipantsUpdate(from, [jid], 'demote');
        await sock.sendMessage(from, {
          text: `✅ @${jid.split('@')[0]} has been demoted from admin.`,
          mentions: [jid],
        });
      }
    },
  },

  mute: {
    description: 'Mute the group (only admins can send)',
    aliases: ['mutegroup', 'muteall'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, isOwner } = ctx;
      const meta = await sock.groupMetadata(from);
      const botAdmin = await isBotAdmin(sock, from);
      const isUserAdmin = await isAdmin(meta, ctx.sender);

      if (!isUserAdmin && !isOwner) {
        await ctx.reply('❌ Only admins can mute the group.');
        return;
      }

      if (!botAdmin) {
        await ctx.reply('❌ I need admin privileges to mute the group.');
        return;
      }

      await sock.groupSettingUpdate(from, 'announcement');
      await ctx.reply('🔇 Group has been muted. Only admins can send messages.');
    },
  },

  unmute: {
    description: 'Unmute the group',
    aliases: ['unmutegroup', 'opengroup'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, isOwner } = ctx;
      const meta = await sock.groupMetadata(from);
      const botAdmin = await isBotAdmin(sock, from);
      const isUserAdmin = await isAdmin(meta, ctx.sender);

      if (!isUserAdmin && !isOwner) {
        await ctx.reply('❌ Only admins can unmute the group.');
        return;
      }

      if (!botAdmin) {
        await ctx.reply('❌ I need admin privileges to unmute the group.');
        return;
      }

      await sock.groupSettingUpdate(from, 'not_announcement');
      await ctx.reply('🔊 Group has been unmuted. Everyone can send messages.');
    },
  },

  groupinfo: {
    description: 'Show group information',
    aliases: ['ginfo', 'groupdata'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from } = ctx;
      try {
        const meta = await sock.groupMetadata(from);
        const admins = meta.participants.filter(p => p.admin);
        const created = new Date(meta.creation * 1000).toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric',
        });

        await ctx.reply(
          `📋 *Group Information*\n\n` +
          `📛 Name: *${meta.subject}*\n` +
          `👥 Members: *${meta.participants.length}*\n` +
          `👑 Admins: *${admins.length}*\n` +
          `📅 Created: *${created}*\n` +
          `🔑 Creator: @${meta.owner?.split('@')[0] || 'Unknown'}\n` +
          `${meta.desc ? `\n📝 Description:\n${meta.desc}` : ''}`,
          { mentions: meta.owner ? [meta.owner] : [] }
        );
      } catch (err) {
        await ctx.reply(`❌ Failed to get group info: ${err.message}`);
      }
    },
  },

  link: {
    description: 'Get group invite link',
    aliases: ['invitelink', 'grouplink'],
    groupOnly: true,
    async execute(ctx) {
      const { sock, from, isOwner } = ctx;
      const meta = await sock.groupMetadata(from);
      const botAdmin = await isBotAdmin(sock, from);
      const isUserAdmin = await isAdmin(meta, ctx.sender);

      if (!isUserAdmin && !isOwner) {
        await ctx.reply('❌ Only admins can get the invite link.');
        return;
      }

      if (!botAdmin) {
        await ctx.reply('❌ I need admin privileges to fetch the invite link.');
        return;
      }

      try {
        const code = await sock.groupInviteCode(from);
        await ctx.reply(
          `🔗 *Group Invite Link*\n\n` +
          `https://chat.whatsapp.com/${code}\n\n` +
          `_Share this link to invite people to the group._`
        );
      } catch (err) {
        await ctx.reply(`❌ Failed to get invite link: ${err.message}`);
      }
    },
  },
};
