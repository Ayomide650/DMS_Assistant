module.exports = {
  // Discord Bot Token from Discord Developer Portal
  BOT_TOKEN: process.env.BOT_TOKEN,
  
  // Whitelisted User ID who can control the bot
  WHITELISTED_USER_ID: process.env.WHITELISTED_USER_ID,
  
  // Together.ai API key
  TOGETHER_API_KEY: process.env.TOGETHER_API_KEY,
  
  // Channel ID where the bot will respond to all messages
  ACTIVE_CHANNEL_ID: process.env.ACTIVE_CHANNEL_ID,
  
  // Bot status flag (controlled by /stop and /alive commands)
  BOT_ENABLED: true,
  
  // Server port for the web server
  PORT: process.env.PORT || 3000,
};
