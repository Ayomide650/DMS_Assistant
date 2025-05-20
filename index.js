const { Client, Events, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { keepAlive } = require('./server');

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
});

// Command handling setup
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  // Set a new item in the Collection with the key as the command name and the value as the exported module
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, c => {
  console.log(`Ready! Logged in as ${c.user.tag}`);
});

// Event handler for slash commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  // Allow '/alive' command to re-enable the bot
  if (interaction.commandName === 'alive' && interaction.user.id === config.WHITELISTED_USER_ID) {
    config.BOT_ENABLED = true;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  }
});

// Message handling
client.on(Events.MessageCreate, async message => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Check if the bot is currently enabled, bypass for whitelisted user
  if (!config.BOT_ENABLED && message.author.id !== config.WHITELISTED_USER_ID) {
    return;
  }
  
  // Check if message is in DM or from whitelisted user
  const isDM = message.channel.type === 'DM';
  const isWhitelisted = message.author.id === config.WHITELISTED_USER_ID;
  
  // Check if the bot is mentioned or if the message is in the active channel
  const botMentioned = message.mentions.users.has(client.user.id);
  const isActiveChannel = message.channelId === config.ACTIVE_CHANNEL_ID;
  
  // Only respond if:
  // 1. It's a DM from the whitelisted user, OR
  // 2. It's in the active channel AND from the whitelisted user, OR
  // 3. The bot is mentioned by the whitelisted user
  if ((isDM && isWhitelisted) || 
      (isActiveChannel && isWhitelisted) || 
      (botMentioned && isWhitelisted)) {
    try {
      // Let the user know the bot is thinking
      const thinkingMessage = await message.channel.send('Thinking...');
      
      // Process the message
      const messageContent = botMentioned 
        ? message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim()
        : message.content;
      
      // Import the bot's response handling from commands/bot.js
      const botCommand = require('./commands/bot');
      const response = await botCommand.generateResponse(messageContent);
      
      // Delete the thinking message and send the response
      await thinkingMessage.delete();
      
      // Split long messages if needed (Discord has a 2000 character limit)
      if (response.length <= 2000) {
        await message.reply(response);
      } else {
        // Split into chunks of 2000 characters
        const chunks = response.match(/.{1,2000}/g) || [];
        for (const chunk of chunks) {
          await message.channel.send(chunk);
        }
      }
    } catch (error) {
      console.error('Error responding to message:', error);
      await message.reply('Sorry, I encountered an error while processing your message.');
    }
  }
});

// Start the keep-alive server for hosting on Render
keepAlive();

// Log in to Discord with your client's token
client.login(config.BOT_TOKEN);
