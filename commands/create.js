// commands/create.js - Dynamic command creation (Whitelisted users only, DM only)
const { SlashCommandBuilder } = require('discord.js');
const config = require('../config');
const fs = require('fs');
const path = require('path');

// Store ongoing command creation sessions
const creationSessions = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create')
    .setDescription('Create a new bot command (Whitelisted users only, DM only)'),
  
  async execute(interaction) {
    // Check if user is whitelisted
    if (!config.WHITELISTED_USERS.includes(interaction.user.id)) {
      await interaction.reply({ 
        content: 'You do not have permission to use this command.', 
        ephemeral: true 
      });
      return;
    }

    // Check if command is used in DM
    if (interaction.guild !== null) {
      await interaction.reply({ 
        content: 'This command can only be used in direct messages.', 
        ephemeral: true 
      });
      return;
    }

    // Start command creation process
    creationSessions.set(interaction.user.id, {
      step: 'name',
      userId: interaction.user.id,
      channelId: interaction.channelId
    });

    await interaction.reply('What command do you want to create? (e.g., /antispam)');
  },

  // Handle DM messages for command creation
  async handleCreationMessage(message, client) {
    const session = creationSessions.get(message.author.id);
    if (!session || message.channelId !== session.channelId) return false;

    try {
      switch (session.step) {
        case 'name':
          session.commandName = message.content.replace('/', '').toLowerCase();
          session.step = 'permission';
          creationSessions.set(message.author.id, session);
          await message.reply('Should this command be for:\n1. All users\n2. Whitelisted users only\n\nType "1" or "2"');
          break;

        case 'permission':
          if (message.content === '1') {
            session.permission = 'all';
          } else if (message.content === '2') {
            session.permission = 'whitelisted';
          } else {
            await message.reply('Please type "1" for all users or "2" for whitelisted only.');
            return true;
          }
          session.step = 'functionality';
          creationSessions.set(message.author.id, session);
          await message.reply('What do you want this command to do? Describe its functionality:');
          break;

        case 'functionality':
          session.functionality = message.content;
          await this.createCommand(session, message, client);
          creationSessions.delete(message.author.id);
          break;
      }
      return true;
    } catch (error) {
      console.error('Error in command creation:', error);
      await message.reply('An error occurred during command creation.');
      creationSessions.delete(message.author.id);
      return true;
    }
  },

  async createCommand(session, message, client) {
    const { commandName, permission, functionality } = session;
    
    // Handle special commands
    if (commandName === 'antispam') {
      await this.createAntiSpamCommand(session, message, client);
      return;
    }

    // Generate command file content
    const commandContent = `// commands/${commandName}.js - Dynamically created command
const { SlashCommandBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('${commandName}')
    .setDescription('${functionality.substring(0, 100)}'),
  
  async execute(interaction) {
    ${permission === 'whitelisted' ? `
    // Check if user is whitelisted
    if (!config.WHITELISTED_USERS.includes(interaction.user.id)) {
      await interaction.reply({ 
        content: 'You do not have permission to use this command.', 
        ephemeral: true 
      });
      return;
    }
    ` : ''}
    
    // Functionality: ${functionality}
    await interaction.reply('Command "${commandName}" executed! Functionality: ${functionality}');
  },
};`;

    // Write command file
    const filePath = path.join(__dirname, `${commandName}.js`);
    fs.writeFileSync(filePath, commandContent);

    // Load the command into the client
    try {
      delete require.cache[require.resolve(`./${commandName}.js`)];
      const command = require(`./${commandName}.js`);
      client.commands.set(command.data.name, command);
      
      await message.reply(`✅ Command "/${commandName}" has been created successfully!\n\n**Functionality:** ${functionality}\n**Permission:** ${permission === 'whitelisted' ? 'Whitelisted users only' : 'All users'}\n\nThe command is now active and ready to use.`);
    } catch (error) {
      console.error('Error loading new command:', error);
      await message.reply('❌ Command file created but failed to load. Please restart the bot.');
    }
  },

  async createAntiSpamCommand(session, message, client) {
    const { functionality } = session;
    
    // Parse channel ID from functionality description
    const channelIdMatch = functionality.match(/\{([^}]+)\}/);
    const targetChannelId = channelIdMatch ? channelIdMatch[1] : config.ACTIVE_CHANNEL_ID;

    // Set up anti-spam functionality in bot.js
    const botCommand = require('./bot');
    botCommand.shouldIgnoreSpam = (channelId) => {
      if (channelId !== targetChannelId) return false;
      
      const now = Date.now();
      const userId = 'current_user'; // This would be set in the message handler
      
      if (!botCommand.userMessageCount.has(userId)) {
        botCommand.userMessageCount.set(userId, { count: 1, lastMessage: now });
        return false;
      }
      
      const userData = botCommand.userMessageCount.get(userId);
      const timeDiff = now - userData.lastMessage;
      
      if (timeDiff < 5000) { // 5 seconds
        userData.count++;
        if (userData.count > 3) { // More than 3 messages in 5 seconds = spam
          return true;
        }
      } else {
        userData.count = 1;
      }
      
      userData.lastMessage = now;
      return false;
    };

    await message.reply(`✅ Anti-spam system has been configured!\n\n**Target Channel:** ${targetChannelId}\n**Rule:** If a user sends more than 3 messages within 5 seconds, the bot will ignore them.\n\nThe anti-spam system is now active.`);
  }
};
