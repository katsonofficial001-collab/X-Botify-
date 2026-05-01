'use strict';

const os = require('os');

module.exports = {
  broadcast: {
    description: 'Broadcast a message to all bot chats (owner only)',
    aliases: ['bc', 'announce'],
    ownerOnly: true,
    async execute(ctx) {
      const { sock, text, BOT_NAME } = ctx;
      if (!text) {
        await ctx.reply(`❌ Usage: ${ctx.PREFIX}broadcast [message]`);
        return;
      }

      await ctx.react('⏳');
      try {
        const chats = await sock.groupFetchAllParticipating();
        const groups = Object.keys(chats);
        let sent = 0;
        const msg = `📢 *${BOT_NAME} Broadcast*\n\n${text}`;

        for (const groupId of groups) {
          try {
            await sock.sendMessage(groupId, { text: msg });
            sent++;
            await new Promise(r => setTimeout(r, 500));
          } catch (_) {}
        }

        await ctx.reply(`✅ Broadcast sent to *${sent}* group(s).`);
        await ctx.react('✅');
      } catch (err) {
        await ctx.reply(`❌ Broadcast failed: ${err.message}`);
        await ctx.react('❌');
      }
    },
  },

  restart: {
    description: 'Restart the bot (owner only)',
    ownerOnly: true,
    async execute(ctx) {
      await ctx.reply(`🔄 *${ctx.BOT_NAME}* is restarting...`);
      setTimeout(() => process.exit(0), 2000);
    },
  },

  status: {
    description: 'Show bot system status (owner only)',
    aliases: ['stats', 'system', 'sys'],
    ownerOnly: true,
    async execute(ctx) {
      const mem = process.memoryUsage();
      const uptime = process.uptime();
      const h = Math.floor(uptime / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const s = Math.floor(uptime % 60);

      const totalMem = (os.totalmem() / 1024 / 1024).toFixed(0);
      const freeMem = (os.freemem() / 1024 / 1024).toFixed(0);
      const usedMem = (mem.rss / 1024 / 1024).toFixed(1);
      const heapUsed = (mem.heapUsed / 1024 / 1024).toFixed(1);

      await ctx.reply(
        `🖥️ *${ctx.BOT_NAME} System Status*\n\n` +
        `⏱️ Uptime: *${h}h ${m}m ${s}s*\n` +
        `💾 RSS Memory: *${usedMem} MB*\n` +
        `🧠 Heap Used: *${heapUsed} MB*\n` +
        `🖥️ System RAM: *${freeMem}/${totalMem} MB free*\n` +
        `⚙️ Platform: *${os.platform()} ${os.arch()}*\n` +
        `🟢 Node.js: *${process.version}*\n` +
        `📦 Bot Version: *v1.0.2*`
      );
    },
  },

  setprefix: {
    description: 'Change the command prefix (owner only)',
    ownerOnly: true,
    async execute(ctx) {
      const { text } = ctx;
      if (!text || text.length > 3) {
        await ctx.reply(`❌ Usage: ${ctx.PREFIX}setprefix [new prefix]\nExample: ${ctx.PREFIX}setprefix !`);
        return;
      }
      process.env.PREFIX = text;
      await ctx.reply(`✅ Prefix changed to: *${text}*\n_Restart the bot to make it permanent._`);
    },
  },

  cleartemp: {
    description: 'Clear temporary files (owner only)',
    ownerOnly: true,
    async execute(ctx) {
      const path = require('path');
      const fs = require('fs');
      const TEMP = path.join(__dirname, '..', '..', 'data', 'temp');
      let count = 0;
      try {
        if (fs.existsSync(TEMP)) {
          const files = fs.readdirSync(TEMP);
          for (const f of files) {
            try { fs.unlinkSync(path.join(TEMP, f)); count++; } catch (_) {}
          }
        }
        await ctx.reply(`✅ Cleared *${count}* temporary file(s).`);
      } catch (err) {
        await ctx.reply(`❌ Failed to clear temp: ${err.message}`);
      }
    },
  },
};
