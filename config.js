module.exports = {
  // Discord Bot Token from Discord Developer Portal
  BOT_TOKEN: process.env.BOT_TOKEN,
  
  // Client ID from Discord Developer Portal
  CLIENT_ID: process.env.CLIENT_ID,
  
  // Ollama API connection details
  OLLAMA_API_URL: process.env.OLLAMA_API_URL || 'http://localhost:11434/api',
  
  // The model you want to use from Ollama
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'llama3',
  
  // Channel ID where the bot will respond to all messages
  ACTIVE_CHANNEL_ID: process.env.ACTIVE_CHANNEL_ID,
  
  // Server port for the web server
  PORT: process.env.PORT || 3000,
};
