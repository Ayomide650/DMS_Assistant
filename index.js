// index.js - Updated to handle dynamic commands and DM creation
const { Client, Events, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { keepAlive } = require('./server');
const botCommand = require('./commands/bot');

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

// Prevent multiple responses to the same message
const processedMessages = new Set();
// Clean up the Set every hour to prevent memory leaks
setInterval(() => {
  processedMessages.clear();
}, 3600000); // Clear every hour

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

// Message handling - Updated to handle DM creation and anti-spam
client.on(Events.MessageCreate, async message => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Check if message was already processed
  if (processedMessages.has(message.id)) return;
  
  // Handle DM messages for command creation
  if (!message.guild) {
    const createCommand = require('./commands/create');
    const handled = await createCommand.handleCreationMessage(message, client);
    if (handled) return;
  }
  
  // Check if the bot is mentioned or if the message is in the active channel
  const botMentioned = message.mentions.users.has(client.user.id);
  const isActiveChannel = message.channelId === config.ACTIVE_CHANNEL_ID;
  
  // Respond to all messages in active channel, or when mentioned in other channels
  if ((isActiveChannel || botMentioned) && message.content.trim() !== '') {
    try {
      // Mark message as processed immediately
      processedMessages.add(message.id);
      
      // Process the message - remove any mention of the bot
      const messageContent = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
      
      // Skip empty messages after removing mentions
      if (messageContent === '') return;
      
      // Initialize bot command if not already done
      if (!botCommand.userConversations) {
        botCommand.userConversations = new Map();
      }
      
      // Anti-spam check  
      const botCommand = require('./commands/bot');
      
      // Update user message count for anti-spam
      const userId = message.author.id;
      const now = Date.now();
      
      if (!botCommand.userMessageCount.has(userId)) {
        botCommand.userMessageCount.set(userId, { count: 1, lastMessage: now });
      } else {
        const userData = botCommand.userMessageCount.get(userId);
        const timeDiff = now - userData.lastMessage;
        
        if (timeDiff < 5000) { // 5 seconds
          userData.count++;
        } else {
          userData.count = 1;
        }
        userData.lastMessage = now;
      }
      
      // Check if should ignore spam
      if (botCommand.shouldIgnoreSpam && botCommand.shouldIgnoreSpam(message.channelId, userId)) {
        console.log(`Ignoring spam from user ${userId} in channel ${message.channelId}`);
        return;
      }
      
      // Set typing indicator to show the bot is working
      message.channel.sendTyping().catch(e => console.error("Could not send typing indicator:", e));
      
      // Generate response with user ID for conversation memory
      const response = await botCommand.generateResponse(messageContent, true, message.channelId, message.author.id);
      
      // If anti-spam returned null, don't respond
      if (response === null) return;
      
      // Split long messages if needed (Discord has a 2000 character limit)
      if (response.length <= 2000) {
        await message.reply(response);
      } else {
        // Split into chunks of 2000 characters
        const chunks = response.match(/.{1,2000}/g) || [];
        let firstChunk = true;
        
        for (const chunk of chunks) {
          if (firstChunk) {
            await message.reply(chunk);
            firstChunk = false;
          } else {
            await message.channel.send(chunk);
          }
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
