'use strict';

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TEMP = path.join(__dirname, '..', '..', 'data', 'temp');
if (!fs.existsSync(TEMP)) fs.mkdirSync(TEMP, { recursive: true });

function tmpFile(ext) {
  return path.join(TEMP, `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
}

module.exports = {
  tts: {
    description: 'Text to speech',
    aliases: ['speak', 'voice'],
    async execute(ctx) {
      const { text, BOT_NAME } = ctx;
      if (!text) {
        await ctx.reply(`❌ Usage: ${ctx.PREFIX}tts [text to speak]`);
        return;
      }
      if (text.length > 200) {
        await ctx.reply('❌ Text too long (max 200 characters).');
        return;
      }

      await ctx.react('⏳');
      try {
        const googleTTS = require('google-tts-api');
        const audioUrl = googleTTS.getAudioUrl(text, { lang: 'en', slow: false, host: 'https://translate.google.com' });
        const res = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 10000 });
        const outFile = tmpFile('mp3');
        fs.writeFileSync(outFile, Buffer.from(res.data));
        const audioBuffer = fs.readFileSync(outFile);
        fs.unlinkSync(outFile);

        await ctx.sock.sendMessage(ctx.from, {
          audio: audioBuffer,
          mimetype: 'audio/mpeg',
          ptt: true,
        }, { quoted: ctx.msg });
        await ctx.react('✅');
      } catch (err) {
        await ctx.reply(`❌ TTS failed: ${err.message}`);
        await ctx.react('❌');
      }
    },
  },

  calc: {
    description: 'Calculate a math expression',
    aliases: ['calculate', 'math', 'eval'],
    async execute(ctx) {
      const { text } = ctx;
      if (!text) {
        await ctx.reply(`❌ Usage: ${ctx.PREFIX}calc [expression]\nExample: ${ctx.PREFIX}calc 2 + 2 * 10`);
        return;
      }
      try {
        const math = require('mathjs');
        const result = math.evaluate(text);
        await ctx.reply(`🔢 *Calculator*\n\n📥 Input: \`${text}\`\n📤 Result: \`${result}\``);
      } catch (err) {
        await ctx.reply(`❌ Invalid expression: ${err.message}`);
      }
    },
  },

  weather: {
    description: 'Get weather for a city',
    aliases: ['w', 'forecast'],
    async execute(ctx) {
      const { text } = ctx;
      if (!text) {
        await ctx.reply(`❌ Usage: ${ctx.PREFIX}weather [city name]`);
        return;
      }

      await ctx.react('⏳');
      try {
        // Geocoding
        const geoRes = await axios.get(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text)}&count=1&language=en&format=json`,
          { timeout: 8000 }
        );
        if (!geoRes.data.results?.length) {
          await ctx.reply(`❌ City not found: "${text}"`);
          return;
        }
        const loc = geoRes.data.results[0];

        // Weather
        const wRes = await axios.get(
          `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`,
          { timeout: 8000 }
        );
        const cur = wRes.data.current;
        const code = cur.weather_code;

        const weatherDesc = (c) => {
          if (c === 0) return '☀️ Clear sky';
          if (c <= 3) return '⛅ Partly cloudy';
          if (c <= 48) return '🌫️ Foggy';
          if (c <= 67) return '🌧️ Rainy';
          if (c <= 77) return '❄️ Snowy';
          if (c <= 82) return '🌦️ Showers';
          if (c <= 95) return '⛈️ Thunderstorm';
          return '🌩️ Severe storm';
        };

        await ctx.reply(
          `🌍 *Weather in ${loc.name}, ${loc.country_code}*\n\n` +
          `${weatherDesc(code)}\n` +
          `🌡️ Temperature: *${cur.temperature_2m}°C*\n` +
          `💧 Humidity: *${cur.relative_humidity_2m}%*\n` +
          `💨 Wind: *${cur.wind_speed_10m} km/h*\n\n` +
          `_Powered by ${ctx.BOT_NAME}_`
        );
        await ctx.react('✅');
      } catch (err) {
        await ctx.reply(`❌ Weather failed: ${err.message}`);
        await ctx.react('❌');
      }
    },
  },

  joke: {
    description: 'Get a random joke',
    aliases: ['jokes', 'funfact'],
    async execute(ctx) {
      await ctx.react('⏳');
      try {
        const res = await axios.get('https://v2.jokeapi.dev/joke/Any?blacklistFlags=nsfw,racist,sexist&type=twopart', { timeout: 8000 });
        const { setup, delivery } = res.data;
        await ctx.reply(`😂 *Joke Time!*\n\n${setup}\n\n🥁 ... ${delivery}`);
        await ctx.react('😂');
      } catch {
        const jokes = [
          'Why did the bot go to school? To improve its *byte*-size knowledge!',
          'Why do programmers prefer dark mode? Because light attracts bugs!',
          'I told my bot a joke about UDP... I\'m not sure if it got it.',
        ];
        await ctx.reply(`😂 *Joke Time!*\n\n${jokes[Math.floor(Math.random() * jokes.length)]}`);
        await ctx.react('😂');
      }
    },
  },

  fact: {
    description: 'Get a random fact',
    aliases: ['facts', 'randomfact'],
    async execute(ctx) {
      await ctx.react('⏳');
      try {
        const res = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 8000 });
        await ctx.reply(`💡 *Random Fact*\n\n${res.data.text}\n\n_${ctx.BOT_NAME}_`);
        await ctx.react('💡');
      } catch {
        const facts = [
          'Honey never spoils. Archaeologists found 3000-year-old honey in Egyptian tombs that was still edible.',
          'A group of flamingos is called a "flamboyance".',
          'Bananas are berries, but strawberries are not.',
          'The average person walks about 100,000 miles in their lifetime.',
        ];
        await ctx.reply(`💡 *Random Fact*\n\n${facts[Math.floor(Math.random() * facts.length)]}`);
        await ctx.react('💡');
      }
    },
  },

  quote: {
    description: 'Get a motivational quote',
    aliases: ['quotes', 'inspire', 'motivation'],
    async execute(ctx) {
      await ctx.react('⏳');
      try {
        const res = await axios.get('https://zenquotes.io/api/random', { timeout: 8000 });
        const { q, a } = res.data[0];
        await ctx.reply(`✨ *Quote of the Day*\n\n_"${q}"_\n\n— *${a}*`);
        await ctx.react('✨');
      } catch {
        const quotes = [
          { q: 'The best time to plant a tree was 20 years ago. The second best time is now.', a: 'Chinese Proverb' },
          { q: 'It does not matter how slowly you go as long as you do not stop.', a: 'Confucius' },
          { q: 'Life is 10% what happens to us and 90% how we react to it.', a: 'Charles R. Swindoll' },
        ];
        const r = quotes[Math.floor(Math.random() * quotes.length)];
        await ctx.reply(`✨ *Quote*\n\n_"${r.q}"_\n\n— *${r.a}*`);
        await ctx.react('✨');
      }
    },
  },
};
