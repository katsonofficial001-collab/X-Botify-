'use strict';

const os = require('os');

module.exports = {
  help: {
    description: 'Show all commands',
    aliases: ['menu', 'commands', 'h'],
    async execute(ctx) {
      const { BOT_NAME, PREFIX, isOwner } = ctx;
      const text = [
        `╭─────────────────────────╮`,
        `│  *${BOT_NAME} v1.0.2*  │`,
        `│  Your WhatsApp Assistant │`,
        `╰─────────────────────────╯`,
        ``,
        `*📌 General*`,
        `${PREFIX}help — This menu`,
        `${PREFIX}ping — Response speed`,
        `${PREFIX}alive — Bot status & uptime`,
        `${PREFIX}info — Bot information`,
        `${PREFIX}owner — Owner contact`,
        ``,
        `*🎨 Media*`,
        `${PREFIX}sticker — Image/GIF/video → sticker`,
        `${PREFIX}toimg — Sticker → image`,
        `${PREFIX}ytmp3 [url/name] — YouTube → MP3`,
        `${PREFIX}ytmp4 [url/name] — YouTube → MP4`,
        ``,
        `*🛠️ Tools*`,
        `${PREFIX}tts [text] — Text to speech`,
        `${PREFIX}calc [expr] — Calculator`,
        `${PREFIX}weather [city] — Weather info`,
        `${PREFIX}joke — Random joke`,
        `${PREFIX}fact — Random fact`,
        `${PREFIX}quote — Motivational quote`,
        ``,
        `*👥 Group Management*`,
        `${PREFIX}tagall [msg] — Tag all members`,
        `${PREFIX}hidetag [msg] — Silent tag all`,
        `${PREFIX}kick @user — Remove member`,
        `${PREFIX}promote @user — Make admin`,
        `${PREFIX}demote @user — Remove admin`,
        `${PREFIX}warn @user [reason] — Warn user (3 = kick)`,
        `${PREFIX}resetwarn @user — Clear warnings`,
        `${PREFIX}mute / ${PREFIX}unmute — Group mute control`,
        `${PREFIX}link — Group invite link`,
        `${PREFIX}groupinfo — Group information`,
        `${PREFIX}groupsettings — All feature statuses`,
        ``,
        `*🛡️ Auto-Features (Group)*`,
        `${PREFIX}antilink on|off|kick — Block links`,
        `${PREFIX}antidelete on|off — Catch deleted msgs`,
        `${PREFIX}antiedit on|off — Catch edited msgs`,
        `${PREFIX}antistatusmention on|off — Block status pings`,
        `${PREFIX}welcome on|off|set [msg] — Welcome new members`,
        `${PREFIX}bye on|off|set [msg] — Goodbye messages`,
        ``,
        ...(isOwner ? [
          `*👑 Owner Only*`,
          `${PREFIX}broadcast [msg] — Message all groups`,
          `${PREFIX}restart — Restart the bot`,
          `${PREFIX}status — System stats`,
          `${PREFIX}cleartemp — Clear temp files`,
          ``,
        ] : []),
        `_Powered by *${BOT_NAME}* — v1.0.2_`,
      ].join('\n');

      await ctx.reply(text);
    },
  },

  ping: {
    description: 'Check response time',
    aliases: ['latency', 'speed'],
    async execute(ctx) {
      const start = Date.now();
      await ctx.reply('_Pinging..._');
      const ms = Date.now() - start;
      await ctx.sock.sendMessage(ctx.from, {
        text: `🏓 *Pong!*\n⚡ Response: *${ms}ms*\n🤖 *${ctx.BOT_NAME} v1.0.2*`,
      }, { quoted: ctx.msg });
    },
  },

  alive: {
    description: 'Check bot status',
    aliases: ['up', 'running'],
    async execute(ctx) {
      const u = process.uptime();
      const h = Math.floor(u / 3600), m = Math.floor((u % 3600) / 60), s = Math.floor(u % 60);
      await ctx.reply(
        `✅ *${ctx.BOT_NAME} is Online!*\n\n` +
        `🕐 Uptime: *${h}h ${m}m ${s}s*\n` +
        `📦 Version: *v1.0.2*\n` +
        `💾 RAM: *${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB*\n` +
        `🟢 Node.js: *${process.version}*`
      );
    },
  },

  info: {
    description: 'Bot information',
    aliases: ['about', 'botinfo'],
    async execute(ctx) {
      await ctx.reply(
        `🤖 *${ctx.BOT_NAME}*\n\n` +
        `📦 Version: *v1.0.2*\n` +
        `⚙️ Platform: *${os.platform()} ${os.arch()}*\n` +
        `🟢 Node.js: *${process.version}*\n` +
        `💾 Memory: *${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB*\n` +
        `🕐 Uptime: *${Math.floor(process.uptime() / 60)} minutes*\n\n` +
        `_${ctx.BOT_NAME} — Your intelligent WhatsApp assistant_`
      );
    },
  },

  owner: {
    description: 'Get owner contact',
    async execute(ctx) {
      const ownerNum = (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
      const ownerName = process.env.OWNER_NAME || 'Admin';
      if (!ownerNum) {
        return ctx.reply(`👤 *Owner:* ${ownerName}\n_Contact not configured._`);
      }
      try {
        await ctx.sock.sendMessage(ctx.from, {
          contacts: {
            displayName: ownerName,
            contacts: [{
              vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${ownerName}\nTEL;type=CELL;waid=${ownerNum}:+${ownerNum}\nEND:VCARD`,
            }],
          },
        });
      } catch {
        await ctx.reply(`👤 *Owner:* ${ownerName}\n📞 +${ownerNum}`);
      }
    },
  },
};
