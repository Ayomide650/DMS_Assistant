const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { token, primaryChannelId } = require('./config');

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  client.commands.set(command.data.name, command);
}

// When the client is ready, run this code
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  console.log(`Primary channel set to: ${primaryChannelId}`);
});

// Listen for interactions (slash commands)
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ 
      content: 'There was an error executing this command!', 
      ephemeral: true 
    });
  }
});

// Message-based command processing
client.on(Events.MessageCreate, async message => {
  // Ignore messages from the bot itself
  if (message.author.bot) return;

  // Get the GPT command
  const command = client.commands.get('gpt');
  if (!command) return;

  // Check if message is in the primary channel
  if (message.channelId === primaryChannelId) {
    // In primary channel: respond to all messages
    try {
      await command.handleMessageCommand(message, message.content.split(/ +/));
    } catch (error) {
      console.error(error);
      await message.reply('There was an error processing your request!');
    }
  } 
  // If not in primary channel, only respond when mentioned
  else if (message.mentions.has(client.user)) {
    try {
      // Remove the mention from the message content
      const content = message.content.replace(/<@!?(\d+)>/g, '').trim();
      await command.handleMessageCommand(message, content.split(/ +/));
    } catch (error) {
      console.error(error);
      await message.reply('There was an error processing your request!');
    }
  }
});

// Login to Discord with your client's token
client.login(token);
