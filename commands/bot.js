// commands/bot.js - Updated for DeepSeek and improved functionality
const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask the DeepSeek AI a question')
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
  
  async generateResponse(prompt, isAntiSpamCheck = false, channelId = null) {
    try {
      // Check if this is an anti-spam scenario
      if (isAntiSpamCheck && this.shouldIgnoreSpam && this.shouldIgnoreSpam(channelId)) {
        return null; // Don't respond to spam
      }

      const response = await axios.post(
        "https://api.together.xyz/v1/chat/completions",
        {
          model: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free",
          messages: [
            { 
              role: "system", 
              content: "You are a professional, concise assistant. Provide brief, clear answers focusing on key information. Avoid unnecessary details and lengthy explanations. Keep responses under 4 sentences when possible. Be direct, accurate, and efficient in your communication. Maintain a professional tone at all times."
            },
            { role: "user", content: prompt }
          ],
          max_tokens: 400,
          temperature: 0.5
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
      throw new Error('Failed to generate response from DeepSeek API.');
    }
  },

  // Anti-spam functionality
  userMessageCount: new Map(),
  shouldIgnoreSpam: null, // Will be set by dynamic commands
  
  // Reset message counts every minute
  resetMessageCounts() {
    setInterval(() => {
      this.userMessageCount.clear();
    }, 60000);
  }
};

// Initialize message count reset
module.exports.resetMessageCounts();
