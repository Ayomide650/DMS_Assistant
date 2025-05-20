// commands/alive.js - Whitelisted only command
const { SlashCommandBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('alive')
    .setDescription('Check if the bot is alive (Whitelisted users only)'),
  
  async execute(interaction) {
    // Check if user is whitelisted
    if (!config.WHITELISTED_USERS.includes(interaction.user.id)) {
      await interaction.reply({ 
        content: 'You do not have permission to use this command.', 
        ephemeral: true 
      });
      return;
    }

    await interaction.reply('I\'m alive! Thanks for asking. 🤖');
  },
};
