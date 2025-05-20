# DMS.EXE Discord Bot

A Discord bot for DMS.EXE's community that uses DeepSeek LLM to provide helpful responses.

## Features

- Uses DeepSeek-AI/DeepSeek-R1-Distill-Llama-70B-free for generating responses
- Token usage tracking for each user
- Admin commands for token management
- Dedicated channels for automatic responses
- Whitelist system for unlimited usage

## Setup

1. Clone this repository
2. Install dependencies
   ```
   npm install
   ```
3. Create a `.env` file using the `.env.template` as reference
4. Set up your Supabase database
5. Start the bot
   ```
   npm start
   ```

## Environment Variables

- `DISCORD_TOKEN`: Your Discord bot token
- `TOGETHER_API_KEY`: Your Together AI API key
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Your Supabase API key
- `ADMIN_IDS`: Comma-separated Discord user IDs for admins
- `WHITELIST_IDS`: Comma-separated Discord user IDs for whitelisted users
- `DEDICATED_CHANNELS`: Comma-separated Discord channel IDs where the bot responds to all messages
- `PORT`: Port for the web server (default: 3000)

## Admin Commands

These commands can only be used in DMs with the bot by users listed in `ADMIN_IDS`:

- `/admin`: Switch to admin-only mode (bot only responds to admins)
- `/all`: Switch to all-users mode (everyone can use the bot)
- `/channel add [channel_id]`: Add a channel to the list of dedicated channels
- `/channel remove [channel_id]`: Remove a channel from the list of dedicated channels
- `/channel list`: View all dedicated channels
- `/topup {user_id} [amount]`: Add tokens to a user's daily limit
- `/limit set [new_amount]`: Change the daily token limit for all users
- `/balance`: See token usage for all users

## Usage

- In dedicated channels (configured via environment variables or using the `/channel` command), users can type messages directly
- In other channels, users need to mention the bot to get a response
- Admins and whitelisted users have unlimited usage
- Regular users are limited to 500 tokens per day (configurable)

## Deployment

This bot is designed to be deployed on Render Web Services:

1. Create a new Web Service on Render and connect to your GitHub repository
2. Use the following settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variables: Add all variables from `.env.template` manually through Render's interface
3. Add all your environment variables securely through Render's web interface
   - DISCORD_TOKEN
   - TOGETHER_API_KEY
   - SUPABASE_URL
   - SUPABASE_KEY
   - ADMIN_IDS (comma-separated user IDs)
   - WHITELIST_IDS (comma-separated user IDs)
   - DEDICATED_CHANNELS (comma-separated channel IDs)
4. Deploy the service

This approach ensures your secrets stay secure and aren't committed to your repository.

## About DMS.EXE

DMS.EXE (@its.justdms) is a prominent Nigerian content creator with over 2.1 million followers and more than 37 million likes on TikTok. He is renowned for his engaging and energetic gaming videos, primarily focusing on Garena Free Fire and Call of Duty Mobile.
