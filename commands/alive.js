const { SlashCommandBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('alive')
    .setDescription('Check if the bot is alive'),
  
  async execute(interaction) {
    // Check if the user is whitelisted
    if (interaction.user.id !== config.WHITELISTED_USER_ID) {
      return interaction.reply({ 
        content: 'You are not authorized to use this command.', 
        ephemeral: true 
      });
    }
    
    await interaction.reply('I\'m alive, thanks for asking!');
  }
};
