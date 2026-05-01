# Botify X v1.0.2

> Intelligent WhatsApp Bot with a built-in Admin Portal. Deploy on Railway in minutes.

---

## 🚀 Deploy on Railway

1. Push this repo to **GitHub**
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Select your repo — Railway detects the Dockerfile automatically
4. After deploy, Railway gives you a public URL like:
   ```
   https://botify-x-production.up.railway.app
   ```

---

## 🔐 Admin Portal

Once deployed, your admin portal is at:

```
https://<your-railway-url>
```

**Default credentials:**
- **Username:** `katson`
- **Password:** `#jesusfuckingchrist#`

---

## 📱 Connect Your WhatsApp Bot (Pairing)

1. Open your Railway app URL
2. Log in with the credentials above
3. Go to the **Pairing** tab
4. Enter your **bot's phone number** (with country code, no spaces or dashes)
   - Example: `2348012345678` for +234 801 234 5678
5. Click **Generate Pairing Code** — wait ~10–30 seconds
6. On the phone you want to use as the bot:
   - Open WhatsApp → ⋮ Menu → **Linked Devices** → **Link a Device**
   - Choose **Link with phone number** (not QR code)
   - Enter the 8-character code shown on the portal
7. Once connected, copy the **SESSION_ID** shown on the portal
8. In Railway → your service → **Variables** → add:
   ```
   SESSION_ID = <paste the session id here>
   ```
9. Railway will auto-redeploy — your bot is now live!

---

## 👥 Adding Users (30-Day Access)

1. Log in to admin portal
2. Go to **Users** tab
3. Enter the user's phone number (with country code)
4. Click **Add User (30 Days)**
5. User can now send commands to the bot
6. After 30 days, their access is automatically revoked
7. Use **Renew** to extend for another 30 days

---

## 🤖 Bot Commands

| Command | Description |
|---|---|
| `.help` | Show all commands |
| `.ping` | Check bot response speed |
| `.alive` | Bot uptime and status |
| `.info` | Bot information |
| `.sticker` | Convert image/GIF to sticker |
| `.toimg` | Convert sticker to image |
| `.ytmp3 [url]` | YouTube → MP3 audio |
| `.ytmp4 [url]` | YouTube → MP4 video |
| `.tts [text]` | Text to speech |
| `.calc [expr]` | Calculator |
| `.weather [city]` | Weather info |
| `.joke` | Random joke |
| `.fact` | Random fact |
| `.quote` | Motivational quote |
| `.tagall` | Tag all group members |
| `.kick @user` | Remove from group |
| `.promote @user` | Make group admin |
| `.demote @user` | Remove admin status |
| `.mute` / `.unmute` | Group mute control |
| `.groupinfo` | Group info |
| `.link` | Get invite link |
| `.broadcast [msg]` | Broadcast (owner only) |
| `.restart` | Restart bot (owner only) |
| `.status` | System stats (owner only) |

---

## ⚙️ Environment Variables

Set these in Railway → service → Variables:

| Variable | Description | Default |
|---|---|---|
| `SESSION_ID` | WhatsApp session (generate via portal) | — |
| `ADMIN_USER` | Portal admin username | `katson` |
| `ADMIN_PASS` | Portal admin password | `#jesusfuckingchrist#` |
| `PREFIX` | Bot command prefix | `.` |
| `OWNER_NUMBER` | Your WhatsApp number (country code + number) | — |
| `OWNER_NAME` | Your name | `Admin` |
| `MODE` | `public` or `private` | `public` |
