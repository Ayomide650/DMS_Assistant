module.exports = {
  // Discord Bot Token from Discord Developer Portal
  BOT_TOKEN: process.env.BOT_TOKEN,
  
  // Together.ai API key
  TOGETHER_API_KEY: process.env.TOGETHER_API_KEY,
  
  // Channel ID where the bot will respond to all messages
  ACTIVE_CHANNEL_ID: process.env.ACTIVE_CHANNEL_ID,
  
  // Comma-separated list of whitelisted user IDs
  WHITELISTED_USERS: process.env.WHITELISTED_USERS ? process.env.WHITELISTED_USERS.split(',') : [],
  
  // Server port for the web server
  PORT: process.env.PORT || 3000,
};
