'use strict';

const os = require('os');

module.exports = {
  help: {
    description: 'Show available commands',
    aliases: ['menu', 'commands', 'h'],
    async execute(ctx) {
      const { BOT_NAME, PREFIX, isOwner } = ctx;
      const text = `
╭──────────────────────╮
│   *${BOT_NAME} v1.0.2*   │
╰──────────────────────╯

*📌 General Commands*
${PREFIX}help — This menu
${PREFIX}ping — Check bot speed
${PREFIX}alive — Bot status
${PREFIX}info — Bot information
${PREFIX}owner — Contact owner

*🎨 Media Commands*
${PREFIX}sticker — Image/GIF → sticker
${PREFIX}toimg — Sticker → image
${PREFIX}ytmp3 [url] — YouTube → audio
${PREFIX}ytmp4 [url] — YouTube → video

*🛠️ Tools*
${PREFIX}tts [text] — Text to speech
${PREFIX}calc [expr] — Calculator
${PREFIX}weather [city] — Weather info
${PREFIX}joke — Random joke
${PREFIX}fact — Random fact
${PREFIX}quote — Motivational quote

*👥 Group Commands*
${PREFIX}tagall — Tag everyone
${PREFIX}kick @user — Remove member
${PREFIX}promote @user — Make admin
${PREFIX}demote @user — Remove admin
${PREFIX}mute — Mute group
${PREFIX}unmute — Unmute group
${PREFIX}groupinfo — Group info
${PREFIX}link — Get invite link

${isOwner ? `*👑 Owner Commands*\n${PREFIX}broadcast [msg] — Send to all\n${PREFIX}restart — Restart bot\n${PREFIX}status — Bot system stats` : ''}

_Powered by ${BOT_NAME}_
      `.trim();

      await ctx.reply(text);
    },
  },

  ping: {
    description: 'Check bot response time',
    aliases: ['latency', 'speed'],
    async execute(ctx) {
      const start = Date.now();
      const sent = await ctx.reply('_Pinging..._');
      const latency = Date.now() - start;
      await ctx.sock.sendMessage(ctx.from, {
        text: `🏓 *Pong!*\n⚡ Response: *${latency}ms*\n🤖 Bot: *${ctx.BOT_NAME} v1.0.2*`,
      }, { quoted: ctx.msg });
    },
  },

  alive: {
    description: 'Check if bot is active',
    aliases: ['up', 'running'],
    async execute(ctx) {
      const uptime = process.uptime();
      const h = Math.floor(uptime / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const s = Math.floor(uptime % 60);
      await ctx.reply(
        `✅ *${ctx.BOT_NAME} is Online!*\n\n` +
        `🕐 Uptime: ${h}h ${m}m ${s}s\n` +
        `📦 Version: v1.0.2\n` +
        `💾 RAM: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB\n` +
        `🖥️ Node: ${process.version}`
      );
    },
  },

  info: {
    description: 'Bot information',
    aliases: ['about', 'botinfo'],
    async execute(ctx) {
      await ctx.reply(
        `🤖 *Bot Information*\n\n` +
        `📛 Name: *${ctx.BOT_NAME}*\n` +
        `📦 Version: *v1.0.2*\n` +
        `⚙️ Platform: ${os.platform()} ${os.arch()}\n` +
        `🖥️ Node.js: ${process.version}\n` +
        `💾 Memory: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB\n` +
        `🕐 Uptime: ${Math.floor(process.uptime() / 60)} minutes\n\n` +
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
        await ctx.reply(`👤 *Owner:* ${ownerName}\n_Owner contact not set._`);
        return;
      }
      try {
        await ctx.sock.sendMessage(ctx.from, {
          contacts: {
            displayName: ownerName,
            contacts: [{
              vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${ownerName}\nTEL;type=CELL;type=VOICE;waid=${ownerNum}:+${ownerNum}\nEND:VCARD`,
            }],
          },
        });
      } catch {
        await ctx.reply(`👤 *Owner:* ${ownerName}\n📞 +${ownerNum}`);
      }
    },
  },
};
