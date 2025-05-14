const { SlashCommandBuilder } = require('@discordjs/builders');
const { openaiApiKey } = require('../config');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gpt')
    .setDescription('Ask GPT-3.5 a question')
    .addStringOption(option =>
      option.setName('prompt')
        .setDescription('Your question or prompt for GPT-3.5')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();
    
    const prompt = interaction.options.getString('prompt');
    
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt }
        ],
        max_tokens: 500
      });
      
      const response = completion.choices[0].message.content;
      
      // Split response if it's too long for a single Discord message
      if (response.length <= 2000) {
        await interaction.editReply(response);
      } else {
        // Split long responses
        for (let i = 0; i < response.length; i += 2000) {
          const chunk = response.substring(i, i + 2000);
          if (i === 0) {
            await interaction.editReply(chunk);
          } else {
            await interaction.followUp(chunk);
          }
        }
      }
    } catch (error) {
      console.error(error);
      await interaction.editReply('Error communicating with GPT-3.5. Please try again later.');
    }
  },
  
  // Handler for message-based commands
  async handleMessageCommand(message, args) {
    // Get the user's prompt from the message
    const prompt = args.join(' ');
    if (!prompt) {
      return; // If no prompt, don't respond
    }
    
    try {
      // Let the user know we're working on it
      const processingMsg = await message.reply('Thinking...');
      
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt }
        ],
        max_tokens: 500
      });
      
      const response = completion.choices[0].message.content;
      
      // Split response if it's too long for a single Discord message
      if (response.length <= 2000) {
        await processingMsg.edit(response);
      } else {
        // Split long responses
        await processingMsg.edit(response.substring(0, 2000));
        
        // Send any remaining content as new messages
        for (let i = 2000; i < response.length; i += 2000) {
          const chunk = response.substring(i, i + 2000);
          await message.channel.send(chunk);
        }
      }
    } catch (error) {
      console.error(error);
      await message.reply('Error communicating with GPT-3.5. Please try again later.');
    }
  }
};
