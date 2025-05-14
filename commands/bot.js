const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask the Ollama AI a question')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('The question to ask')
        .setRequired(true)),
  
  async execute(interaction) {
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
      const response = await axios.post(`${config.OLLAMA_API_URL}/generate`, {
        model: config.OLLAMA_MODEL,
        prompt: prompt,
        stream: false
      });
      
      return response.data.response;
    } catch (error) {
      console.error('Error calling Ollama API:', error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      }
      throw new Error('Failed to generate response from Ollama.');
    }
  }
};
