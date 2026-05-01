'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const TEMP = path.join(__dirname, '..', '..', 'data', 'temp');
if (!fs.existsSync(TEMP)) fs.mkdirSync(TEMP, { recursive: true });

function tmpFile(ext) {
  return path.join(TEMP, `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
}

function cleanup(...files) {
  for (const f of files) {
    try { fs.unlinkSync(f); } catch (_) {}
  }
}

async function downloadMedia(sock, msg) {
  const { downloadMediaMessage } = require('@whiskeysockets/baileys');
  const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: { level: 'silent' } });
  return buffer;
}

async function downloadQuotedMedia(sock, msg, quotedInfo) {
  const { downloadMediaMessage } = require('@whiskeysockets/baileys');
  const fakeMsg = {
    key: msg.key,
    message: quotedInfo.message,
  };
  const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {}, { logger: { level: 'silent' } });
  return buffer;
}

module.exports = {
  sticker: {
    description: 'Convert image/GIF/video to sticker (reply to media)',
    aliases: ['s', 'stiker'],
    async execute(ctx) {
      const { sock, msg, from, quoted, BOT_NAME } = ctx;
      const { downloadMediaMessage } = require('@whiskeysockets/baileys');

      let targetMsg = null;
      let mediaType = null;

      if (quoted) {
        const qt = quoted.type;
        if (['imageMessage', 'videoMessage', 'stickerMessage'].includes(qt)) {
          targetMsg = { key: msg.key, message: quoted.message };
          mediaType = qt;
        }
      } else {
        const mt = ctx.msgType;
        if (['imageMessage', 'videoMessage'].includes(mt)) {
          targetMsg = msg;
          mediaType = mt;
        }
      }

      if (!targetMsg) {
        await ctx.reply('❌ Please reply to or send an image/video/GIF with this command.');
        return;
      }

      await ctx.react('⏳');

      try {
        const buffer = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: { level: 'silent' } });

        const inputFile = tmpFile(mediaType === 'videoMessage' ? 'mp4' : 'png');
        fs.writeFileSync(inputFile, buffer);

        const outputFile = tmpFile('webp');
        const { execSync } = require('child_process');

        if (mediaType === 'videoMessage') {
          execSync(
            `ffmpeg -i "${inputFile}" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15" -vcodec libwebp -loop 0 -compression_level 6 -quality 80 -an -ss 0 -t 8 "${outputFile}"`,
            { timeout: 30000 }
          );
        } else {
          execSync(
            `ffmpeg -i "${inputFile}" -vf "scale=512:512:force_original_aspect_ratio=decrease" -c:v libwebp -quality 80 "${outputFile}"`,
            { timeout: 15000 }
          );
        }

        const stickerBuffer = fs.readFileSync(outputFile);
        await sock.sendMessage(from, {
          sticker: stickerBuffer,
          mimetype: 'image/webp',
        }, { quoted: msg });

        cleanup(inputFile, outputFile);
        await ctx.react('✅');
      } catch (err) {
        await ctx.reply(`❌ Failed to create sticker: ${err.message}`);
        await ctx.react('❌');
      }
    },
  },

  toimg: {
    description: 'Convert sticker to image (reply to sticker)',
    aliases: ['toimage', 'stickertoimg'],
    async execute(ctx) {
      const { sock, msg, from, quoted } = ctx;
      const { downloadMediaMessage } = require('@whiskeysockets/baileys');

      let targetMsg = null;
      if (quoted?.type === 'stickerMessage') {
        targetMsg = { key: msg.key, message: quoted.message };
      } else if (ctx.msgType === 'stickerMessage') {
        targetMsg = msg;
      }

      if (!targetMsg) {
        await ctx.reply('❌ Reply to a sticker to convert it to an image.');
        return;
      }

      await ctx.react('⏳');
      try {
        const buffer = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger: { level: 'silent' } });
        const inputFile = tmpFile('webp');
        const outputFile = tmpFile('png');
        fs.writeFileSync(inputFile, buffer);

        const { execSync } = require('child_process');
        execSync(`ffmpeg -i "${inputFile}" "${outputFile}"`, { timeout: 10000 });

        const imgBuffer = fs.readFileSync(outputFile);
        await sock.sendMessage(from, {
          image: imgBuffer,
          caption: `🖼️ Converted by *${ctx.BOT_NAME}*`,
          mimetype: 'image/png',
        }, { quoted: msg });

        cleanup(inputFile, outputFile);
        await ctx.react('✅');
      } catch (err) {
        await ctx.reply(`❌ Failed to convert sticker: ${err.message}`);
        await ctx.react('❌');
      }
    },
  },

  ytmp3: {
    description: 'Download YouTube audio',
    aliases: ['mp3', 'song', 'audio', 'playaudio'],
    async execute(ctx) {
      const { text } = ctx;
      if (!text) {
        await ctx.reply(`❌ Usage: ${ctx.PREFIX}ytmp3 [YouTube URL or song name]`);
        return;
      }

      await ctx.react('⏳');

      try {
        let url = text;
        if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
          const yts = require('yt-search');
          const res = await yts(text);
          if (!res.videos?.length) throw new Error('No results found');
          url = res.videos[0].url;
          await ctx.reply(`🎵 Found: *${res.videos[0].title}*\n⬇️ Downloading...`);
        }

        const ytdl = require('ytdl-core');
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title;
        const duration = parseInt(info.videoDetails.lengthSeconds, 10);

        if (duration > 600) {
          await ctx.reply('❌ Video is too long (max 10 minutes for audio).');
          await ctx.react('❌');
          return;
        }

        const outFile = tmpFile('mp3');
        const { execSync } = require('child_process');

        const audioStream = ytdl(url, { quality: 'highestaudio', filter: 'audioonly' });
        const chunks = [];
        await new Promise((resolve, reject) => {
          audioStream.on('data', c => chunks.push(c));
          audioStream.on('end', resolve);
          audioStream.on('error', reject);
        });

        const rawFile = tmpFile('opus');
        fs.writeFileSync(rawFile, Buffer.concat(chunks));
        execSync(`ffmpeg -i "${rawFile}" -q:a 0 "${outFile}"`, { timeout: 60000 });

        const audioBuffer = fs.readFileSync(outFile);
        await ctx.sock.sendMessage(ctx.from, {
          audio: audioBuffer,
          mimetype: 'audio/mpeg',
          ptt: false,
          fileName: `${title}.mp3`,
        }, { quoted: ctx.msg });

        cleanup(rawFile, outFile);
        await ctx.react('✅');
      } catch (err) {
        await ctx.reply(`❌ Download failed: ${err.message}`);
        await ctx.react('❌');
      }
    },
  },

  ytmp4: {
    description: 'Download YouTube video',
    aliases: ['mp4', 'video', 'playvideo'],
    async execute(ctx) {
      const { text } = ctx;
      if (!text) {
        await ctx.reply(`❌ Usage: ${ctx.PREFIX}ytmp4 [YouTube URL or video name]`);
        return;
      }

      await ctx.react('⏳');

      try {
        let url = text;
        if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
          const yts = require('yt-search');
          const res = await yts(text);
          if (!res.videos?.length) throw new Error('No results found');
          url = res.videos[0].url;
          await ctx.reply(`🎬 Found: *${res.videos[0].title}*\n⬇️ Downloading...`);
        }

        const ytdl = require('ytdl-core');
        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title;
        const duration = parseInt(info.videoDetails.lengthSeconds, 10);

        if (duration > 300) {
          await ctx.reply('❌ Video is too long (max 5 minutes for video).');
          await ctx.react('❌');
          return;
        }

        const videoStream = ytdl(url, { quality: 'highest', filter: 'videoandaudio' });
        const chunks = [];
        await new Promise((resolve, reject) => {
          videoStream.on('data', c => chunks.push(c));
          videoStream.on('end', resolve);
          videoStream.on('error', reject);
        });

        const videoBuffer = Buffer.concat(chunks);
        await ctx.sock.sendMessage(ctx.from, {
          video: videoBuffer,
          mimetype: 'video/mp4',
          caption: `🎬 *${title}*\n_Downloaded by ${ctx.BOT_NAME}_`,
          fileName: `${title}.mp4`,
        }, { quoted: ctx.msg });

        await ctx.react('✅');
      } catch (err) {
        await ctx.reply(`❌ Download failed: ${err.message}`);
        await ctx.react('❌');
      }
    },
  },
};
