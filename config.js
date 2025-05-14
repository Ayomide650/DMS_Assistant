require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID,
  openaiApiKey: process.env.OPENAI_API_KEY,
  primaryChannelId: process.env.PRIMARY_CHANNEL_ID
};
