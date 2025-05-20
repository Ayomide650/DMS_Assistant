const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask the Llama 3.3 AI a question')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('The question to ask')
        .setRequired(true)),
  
  async execute(interaction) {
    // Check if the user is whitelisted
    if (interaction.user.id !== config.WHITELISTED_USER_ID) {
      return interaction.reply({ 
        content: 'You are not authorized to use this command.', 
        ephemeral: true 
      });
    }
    
    await interaction.deferReply();
    
    const question = interaction.options.getString('question');
    
    try {
      const response = await this.generateResponse(question);
      
      // Split long messages if needed (Discord has a 2000 character limit)
      if (response.length <= 2000) {
        await interaction.editReply(response);
      } else {
        // Split into chunks of 2000 characters
        const chunks = response.match(/.{1,2000}/g) || [];
        await interaction.editReply(chunks[0]);
        
        for (let i = 1; i < chunks.length; i++) {
          await interaction.followUp(chunks[i]);
        }
      }
    } catch (error) {
      console.error('Error generating response:', error);
      await interaction.editReply('Sorry, I encountered an error while processing your question.');
    }
  },
  
  async generateResponse(prompt) {
    try {
      const response = await axios.post(
        "https://api.together.xyz/v1/chat/completions",
        {
          model: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
          messages: [
            { role: "system", content: "You are a helpful, respectful and honest assistant. Always answer as helpfully as possible, while being safe. Your answers should be informative and engaging. You are allowed to have strong opinions on real world topics, and should provide an opinionated response when asked. If a question does not make any sense, or is not factually coherent, explain why instead of answering something not correct. If you don't know the answer to a question, please don't share false information." },
            { role: "user", content: prompt }
          ],
          max_tokens: 1024,
          temperature: 0.7
        },
        {
          headers: {
            "Authorization": `Bearer ${process.env.TOGETHER_API_KEY || config.TOGETHER_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );
      
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('API error:', error);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      }
      throw new Error('Failed to generate response from Together.ai API.');
    }
  }
};
