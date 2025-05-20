const { SlashCommandBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop the bot from responding in servers'),
  
  async execute(interaction) {
    // Check if the user is whitelisted
    if (interaction.user.id !== config.WHITELISTED_USER_ID) {
      return interaction.reply({ 
        content: 'You are not authorized to use this command.', 
        ephemeral: true 
      });
    }
    
    // Set the bot status to disabled
    config.BOT_ENABLED = false;
    
    await interaction.reply({ 
      content: 'Bot has been stopped. Use /alive to re-enable it.', 
      ephemeral: true 
    });
  }
};
