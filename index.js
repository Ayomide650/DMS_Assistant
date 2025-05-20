// Message handling section in index.js
client.on(Events.MessageCreate, async message => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Check if the bot is mentioned or if the message is in the active channel
  const botMentioned = message.mentions.users.has(client.user.id);
  const isActiveChannel = message.channelId === config.ACTIVE_CHANNEL_ID;
  
  // Only respond if the bot is mentioned or the message is in the active channel
  if (isActiveChannel || botMentioned) {
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
