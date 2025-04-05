# Instagram Forwarder to Discord

A Discord bot that forwards Instagram reels and posts to Discord channels using Selenium.

## What it does

- Monitors your Instagram inbox
- Forwards new posts and reels to a Discord channel
- Uses Cobalt to download Instagram media

## Setup

1. Clone the repository
   ```
   git clone https://github.com/DwiRizqiH/bot-forwarder-ig_discord
   ```

2. Go to project folder
   ```
   cd bot-forwarder-ig_discord
   ```

3. Setup configuration
   ```
   # Rename example.env to .env
   # Edit .env file with your details:
   # - Discord token
   # - Instagram username & password
   # - Cobalt URL
   ```

4. Install dependencies
   ```
   npm install
   ```

5. Run the bot
   ```
   node index.js
   ```

   Or with PM2 (keeps bot running in background):
   ```
   npm install -g pm2
   pm2 start index.js
   ```

## Discord Commands

- `/here` - Set current channel to receive Instagram media
- `/unhere` - Stop sending Instagram media to this channel

## Required Permissions

- **Manage Webhooks** - The bot uses webhooks to send messages to Discord
- Permissions to send messages and files

## Notes

- You need your own Cobalt instance or a public one
- Make sure your Discord bot has the correct permissions when inviting it to your server

---

Feel free to contribute to this project!
