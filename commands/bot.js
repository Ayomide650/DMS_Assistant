// commands/bot.js - Updated for DeepSeek with conversation memory
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
      const response = await this.generateResponse(question, false, null, interaction.user.id);
      
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
  
  // Store conversation history for each user
  userConversations: new Map(),
  
  // Maximum messages to keep in memory per user (last 10 messages)
  MAX_HISTORY: 10,
  
  async generateResponse(prompt, isAntiSpamCheck = false, channelId = null, userId = null) {
    try {
      // Check if this is an anti-spam scenario
      if (isAntiSpamCheck && this.shouldIgnoreSpam && this.shouldIgnoreSpam(channelId, userId)) {
        return null; // Don't respond to spam
      }

      // Get or create conversation history for this user
      if (!this.userConversations.has(userId)) {
        this.userConversations.set(userId, []);
      }
      
      const userHistory = this.userConversations.get(userId);
      
      // Build messages array starting with system prompt
      const messages = [
        { 
          role: "system", 
          content: "You are a helpful, concise assistant. Keep responses SHORT and to the point - maximum 2-3 sentences. Be direct and don't over-explain. If asked about previous messages, refer to the conversation history provided."
        }
      ];
      
      // Add conversation history (recent messages)
      messages.push(...userHistory);
      
      // Add current user message
      messages.push({ role: "user", content: prompt });

      const response = await axios.post(
        "https://api.together.xyz/v1/chat/completions",
        {
          model: "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free",
          messages: messages,
          max_tokens: 200, // Reduced further for shorter responses
          temperature: 0.3, // Lower temperature for more focused responses
          top_p: 0.8
        },
        {
          headers: {
            "Authorization": `Bearer ${process.env.TOGETHER_API_KEY || config.TOGETHER_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );
      
      const responseText = response.data.choices[0].message.content;
      
      // Update conversation history
      userHistory.push({ role: "user", content: prompt });
      userHistory.push({ role: "assistant", content: responseText });
      
      // Keep only the last MAX_HISTORY messages (pairs of user/assistant)
      if (userHistory.length > this.MAX_HISTORY * 2) {
        userHistory.splice(0, userHistory.length - (this.MAX_HISTORY * 2));
      }
      
      return responseText;
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
  },
  
  // Clear old conversations every hour to prevent memory leaks
  clearOldConversations() {
    setInterval(() => {
      console.log(`Clearing conversation memory for ${this.userConversations.size} users`);
      this.userConversations.clear();
    }, 3600000); // Clear every hour
  }
};

// Initialize message count reset
module.exports.resetMessageCounts();
