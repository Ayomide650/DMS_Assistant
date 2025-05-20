require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Bot configuration
const config = {
  botEnabled: true,
  allowedChannels: process.env.DEDICATED_CHANNELS ? process.env.DEDICATED_CHANNELS.split(',') : [], 
  allowAll: false, // Whether bot responds to all users
  tokenLimit: 500, // Default token limit per user per day
  memoryEnabled: true, // Enable chat memory
  memoryLimit: 5, // Number of past conversations to remember per user
};

// Parse admin and whitelist IDs from environment variables
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
const WHITELIST_IDS = process.env.WHITELIST_IDS ? process.env.WHITELIST_IDS.split(',') : [];

// DMS.EXE information for the bot
const BOT_INFO = {
  creator: {
    name: "DMS.EXE",
    tiktok: "@its.justdms",
    followers: "2.1 million",
    likes: "37 million",
    description: "DMS.EXE is a prominent Nigerian content creator known for engaging and energetic gaming videos, primarily focusing on Garena Free Fire and Call of Duty Mobile. His content features high-skill gameplay, humorous commentary, and relatable reactions."
  }
};

// Function to check if user is admin
function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

// Function to check if user is whitelisted
function isWhitelisted(userId) {
  return WHITELIST_IDS.includes(userId) || isAdmin(userId);
}

// Helper function to handle bot typing indicator
async function withTypingIndicator(channel, callback) {
  try {
    await channel.sendTyping();
    return await callback();
  } catch (error) {
    console.error('Error with typing indicator:', error);
    throw error;
  }
}

// ==================== MODIFIED CHAT MEMORY FUNCTIONS ====================

// Function to get chat memory for a user
async function getChatMemory(userId) {
  try {
    // First try using RPC function if available
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_chat_memory', {
        p_user_id: userId
      });
      
      if (!rpcError && rpcData) {
        return rpcData.memory || [];
      }
    } catch (rpcFuncError) {
      console.error('RPC get_chat_memory not available:', rpcFuncError);
      // Continue to fallback
    }
    
    // Fallback to direct query
    const { data, error } = await supabase
      .from('chat_memory')
      .select('memory')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      // If no record exists yet, return empty array
      if (error.code === 'PGRST116') {
        return [];
      }
      console.error('Error fetching chat memory:', error);
      return [];
    }
    
    // Parse the JSONB memory field and return the array of conversations
    return data?.memory || [];
  } catch (error) {
    console.error('Error getting chat memory:', error);
    return [];
  }
}

// Function to store a new conversation in chat memory
async function storeChatMemory(userId, userMessage, botResponse) {
  try {
    // Get current memory for this user
    const { data, error } = await supabase
      .from('chat_memory')
      .select('memory')
      .eq('user_id', userId)
      .single();
      
    // Create new memory entry
    const newMemory = {
      user_message: userMessage,
      bot_response: botResponse,
      timestamp: new Date().toISOString()
    };
    
    let memories = [];
    const currentTime = new Date().toISOString();
    
    if (error) {
      // If record doesn't exist, create new array with this memory
      memories = [newMemory];
      
      try {
        // Try to use RPC function if available (safer with RLS)
        const { error: rpcError } = await supabase.rpc('create_chat_memory', {
          p_user_id: userId,
          p_last_message: userMessage,
          p_memory: memories,
          p_updated_at: currentTime
        });
        
        if (rpcError) {
          console.error('Error with RPC create_chat_memory:', rpcError);
          
          // Fallback to direct insert with RLS bypass option
          console.log('Attempting direct insert...');
          const { error: insertError } = await supabase
            .from('chat_memory')
            .insert([{
              user_id: userId,
              last_message: userMessage,
              memory: memories,
              updated_at: currentTime
            }]);
          
          if (insertError) {
            console.error('Error creating new chat memory record:', insertError);
          }
        }
      } catch (funcError) {
        console.error('RPC function error:', funcError);
        
        // Last resort - try direct insert
        const { error: insertError } = await supabase
          .from('chat_memory')
          .insert([{
            user_id: userId,
            last_message: userMessage,
            memory: memories,
            updated_at: currentTime
          }]);
        
        if (insertError) {
          console.error('Error creating new chat memory record:', insertError);
        }
      }
    } else {
      // Get existing memories and add new one at the beginning
      memories = data?.memory || [];
      memories.unshift(newMemory);
      
      // Keep only up to memoryLimit memories
      if (memories.length > config.memoryLimit) {
        memories = memories.slice(0, config.memoryLimit);
      }
      
      try {
        // Try to use RPC function if available (safer with RLS)
        const { error: rpcError } = await supabase.rpc('update_chat_memory', {
          p_user_id: userId,
          p_last_message: userMessage,
          p_memory: memories,
          p_updated_at: currentTime
        });
        
        if (rpcError) {
          console.error('Error with RPC update_chat_memory:', rpcError);
          
          // Fallback to direct update
          const { error: updateError } = await supabase
            .from('chat_memory')
            .update({
              last_message: userMessage,
              memory: memories,
              updated_at: currentTime
            })
            .eq('user_id', userId);
          
          if (updateError) {
            console.error('Error updating chat memory:', updateError);
          }
        }
      } catch (funcError) {
        console.error('RPC function error:', funcError);
        
        // Last resort - try direct update
        const { error: updateError } = await supabase
          .from('chat_memory')
          .update({
            last_message: userMessage,
            memory: memories,
            updated_at: currentTime
          })
          .eq('user_id', userId);
        
        if (updateError) {
          console.error('Error updating chat memory:', updateError);
        }
      }
    }
  } catch (error) {
    console.error('Error storing chat memory:', error);
  }
}

// Function to format chat memory for the API prompt
function formatChatMemory(memories) {
  if (!memories || memories.length === 0) {
    return '';
  }
  
  // Format memories - they should already be in newest-to-oldest order
  let memoryText = 'Previous conversations:\n';
  memories.forEach((memory, index) => {
    memoryText += `User: ${memory.user_message}\n`;
    memoryText += `Assistant: ${memory.bot_response}\n`;
    
    // Add separator between memories
    if (index < memories.length - 1) {
      memoryText += '\n';
    }
  });
  
  return memoryText;
}

// Function to clear chat memory for a user
async function clearChatMemory(userId) {
  try {
    // First try using RPC function if available
    try {
      const { error: rpcError } = await supabase.rpc('clear_chat_memory', {
        p_user_id: userId
      });
      
      if (!rpcError) {
        return true;
      } else {
        console.error('Error with RPC clear_chat_memory:', rpcError);
      }
    } catch (rpcFuncError) {
      console.error('RPC clear_chat_memory not available:', rpcFuncError);
      // Continue to fallback
    }
    
    // Fallback to direct delete
    const { error } = await supabase
      .from('chat_memory')
      .delete()
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error clearing chat memory:', error);
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error clearing chat memory:', error);
    throw error;
  }
}

// ==================== END MODIFIED CHAT MEMORY FUNCTIONS ====================

// Function to generate response from Together API
async function generateResponse(prompt, userId) {
  try {
    // Get chat memory if enabled
    let chatMemory = '';
    if (config.memoryEnabled) {
      const memories = await getChatMemory(userId);
      chatMemory = formatChatMemory(memories);
    }
    
    const apiPrompt = `You are a helpful assistant for DMS.EXE.
${BOT_INFO.creator.description}
Be concise and helpful.

${chatMemory ? chatMemory + '\n' : ''}
User: ${prompt}
Assistant:`;

    const response = await axios.post(
      'https://api.together.xyz/v1/completions',
      {
        model: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free',
        prompt: apiPrompt,
        max_tokens: 500,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0,
        presence_penalty: 0,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Extract the tokens used
    const tokensUsed = response.data.usage.total_tokens;
    
    // Update token usage in database
    if (!isWhitelisted(userId)) {
      await updateTokenUsage(userId, tokensUsed);
    }
    
    const responseText = response.data.choices[0].text.trim();
    
    // Store the conversation in memory if enabled
    if (config.memoryEnabled) {
      await storeChatMemory(userId, prompt, responseText);
    }
    
    return {
      text: responseText,
      tokensUsed
    };
  } catch (error) {
    console.error('Error generating response:', error);
    throw error;
  }
}

// Load config from database (We'll use config table if it exists)
async function loadConfig() {
  try {
    // Try to load config from the database
    const { data: tokenLimit, error: tokenLimitError } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'token_limit')
      .single();
    
    if (!tokenLimitError && tokenLimit) {
      config.tokenLimit = tokenLimit.value;
    }
    
    const { data: allowedChannels, error: channelsError } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'allowed_channels')
      .single();
    
    if (!channelsError && allowedChannels) {
      // Start with channels from env
      const envChannels = process.env.DEDICATED_CHANNELS ? process.env.DEDICATED_CHANNELS.split(',') : [];
      
      // Add channels from database if they exist
      if (Array.isArray(allowedChannels.value)) {
        // Create a Set to ensure unique channel IDs
        const channelSet = new Set([...envChannels, ...allowedChannels.value]);
        config.allowedChannels = [...channelSet];
      }
    }
    
    const { data: allowAll, error: allowAllError } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'allow_all')
      .single();
    
    if (!allowAllError && allowAll) {
      config.allowAll = allowAll.value;
    }
    
    // Try to load memory settings
    const { data: memoryEnabled, error: memoryEnabledError } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'memory_enabled')
      .single();
    
    if (!memoryEnabledError && memoryEnabled !== null) {
      config.memoryEnabled = memoryEnabled.value;
    }
    
    const { data: memoryLimit, error: memoryLimitError } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'memory_limit')
      .single();
    
    if (!memoryLimitError && memoryLimit !== null) {
      config.memoryLimit = memoryLimit.value;
    }
    
    console.log('Config loaded from database:', config);
  } catch (error) {
    console.error('Error loading config:', error);
  }
}

// Function to check and update token usage
async function checkTokenUsage(userId) {
  try {
    // Get user data
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    // If user doesn't exist, create them
    if (!user) {
      await supabase
        .from('users')
        .insert([
          { 
            id: userId, 
            tokens_used_today: 0, 
            last_reset: new Date().toISOString() 
          }
        ]);
      return 0;
    }
    
    // Check if we need to reset the counter (it's a new day)
    const lastReset = new Date(user.last_reset);
    const today = new Date();
    if (lastReset.getDate() !== today.getDate() || 
        lastReset.getMonth() !== today.getMonth() || 
        lastReset.getFullYear() !== today.getFullYear()) {
      // Reset token usage
      await supabase
        .from('users')
        .update({ 
          tokens_used_today: 0, 
          last_reset: today.toISOString() 
        })
        .eq('id', userId);
      return 0;
    }
    
    return user.tokens_used_today;
  } catch (error) {
    console.error('Error checking token usage:', error);
    return 0;
  }
}

// Function to update token usage
async function updateTokenUsage(userId, tokens) {
  try {
    // Get current usage
    const currentUsage = await checkTokenUsage(userId);
    
    // Update usage
    await supabase
      .from('users')
      .update({ 
        tokens_used_today: currentUsage + tokens 
      })
      .eq('id', userId);
    
    return currentUsage + tokens;
  } catch (error) {
    console.error('Error updating token usage:', error);
    throw error;
  }
}

// Function to topup user tokens
async function topupUserTokens(userId, amount) {
  try {
    // Get current usage
    const currentUsage = await checkTokenUsage(userId);
    
    // Subtract the amount (effectively increasing their available tokens)
    const newUsage = Math.max(0, currentUsage - amount);
    
    // Update usage
    await supabase
      .from('users')
      .update({ 
        tokens_used_today: newUsage 
      })
      .eq('id', userId);
    
    return newUsage;
  } catch (error) {
    console.error('Error topping up tokens:', error);
    throw error;
  }
}

// Function to process commands
async function processCommand(message) {
  const content = message.content.trim();
  const userId = message.author.id;
  
  // Only admins can use commands
  if (!isAdmin(userId)) {
    return;
  }
  
  if (content.startsWith('/admin')) {
    await message.reply('Admin mode activated. I will only respond to admins now.');
    config.allowAll = false;
    await supabase
      .from('config')
      .update({ value: false })
      .eq('key', 'allow_all');
  } 
  else if (content.startsWith('/all')) {
    await message.reply('All users mode activated. I will respond to everyone now.');
    config.allowAll = true;
    await supabase
      .from('config')
      .update({ value: true })
      .eq('key', 'allow_all');
  }
  else if (content.startsWith('/channel')) {
    const args = content.split(' ');
    if (args.length === 3) {
      const action = args[1]; // add or remove
      const channelId = args[2];
      
      if (action === 'add') {
        if (!config.allowedChannels.includes(channelId)) {
          config.allowedChannels.push(channelId);
          await supabase
            .from('config')
            .update({ value: config.allowedChannels })
            .eq('key', 'allowed_channels');
          await message.reply(`Channel <#${channelId}> added to dedicated channels.`);
        } else {
          await message.reply(`Channel <#${channelId}> is already a dedicated channel.`);
        }
      } 
      else if (action === 'remove') {
        if (config.allowedChannels.includes(channelId)) {
          config.allowedChannels = config.allowedChannels.filter(id => id !== channelId);
          await supabase
            .from('config')
            .update({ value: config.allowedChannels })
            .eq('key', 'allowed_channels');
          await message.reply(`Channel <#${channelId}> removed from dedicated channels.`);
        } else {
          await message.reply(`Channel <#${channelId}> is not a dedicated channel.`);
        }
      }
      else {
        await message.reply('Usage: /channel add|remove|list [channel_id]');
      }
    } else if (args.length === 2 && args[1] === 'list') {
      if (config.allowedChannels.length === 0) {
        await message.reply('No dedicated channels set.');
      } else {
        let response = '**Dedicated Channels:**\n';
        for (const channelId of config.allowedChannels) {
          response += `<#${channelId}> (${channelId})\n`;
        }
        await message.reply(response);
      }
    } else {
      await message.reply('Usage: /channel add|remove|list [channel_id]');
    }
  }
  else if (content.startsWith('/topup')) {
    const args = content.split(' ');
    if (args.length === 3) {
      const targetId = args[1];
      const amount = parseInt(args[2]);
      
      if (!isNaN(amount) && amount > 0) {
        const newUsage = await topupUserTokens(targetId, amount);
        await message.reply(`Topped up ${amount} tokens for user <@${targetId}>. They now have used ${newUsage} tokens today.`);
      } else {
        await message.reply('Invalid amount. Please provide a positive number.');
      }
    } else {
      await message.reply('Usage: /topup {user_id} [amount]');
    }
  }
  else if (content.startsWith('/limit')) {
    const args = content.split(' ');
    if (args.length === 3 && args[1] === 'set') {
      const limit = parseInt(args[2]);
      
      if (!isNaN(limit) && limit > 0) {
        config.tokenLimit = limit;
        await supabase
          .from('config')
          .update({ value: limit })
          .eq('key', 'token_limit');
        
        await message.reply(`Token limit updated to ${limit} per user per day.`);
      } else {
        await message.reply('Invalid limit. Please provide a positive number.');
      }
    } else {
      await message.reply('Usage: /limit set [new amount]');
    }
  }
  else if (content.startsWith('/balance')) {
    // Get all users and their token usage
    const { data: users, error } = await supabase
      .from('users')
      .select('*');
    
    if (error) {
      await message.reply('Error fetching user balances.');
      return;
    }
    
    let response = '**User Token Usage Today:**\n';
    for (const user of users) {
      response += `<@${user.id}>: ${user.tokens_used_today}/${config.tokenLimit} tokens\n`;
    }
    
    await message.reply(response);
  }
  else if (content.startsWith('/memory')) {
    const args = content.split(' ');
    
    if (args.length >= 2) {
      const action = args[1]; // enable, disable, clear, limit
      
      if (action === 'enable') {
        config.memoryEnabled = true;
        // Update in database if config table exists
        await supabase
          .from('config')
          .upsert({ key: 'memory_enabled', value: true })
          .eq('key', 'memory_enabled');
        
        await message.reply('Chat memory enabled.');
      } 
      else if (action === 'disable') {
        config.memoryEnabled = false;
        // Update in database if config table exists
        await supabase
          .from('config')
          .upsert({ key: 'memory_enabled', value: false })
          .eq('key', 'memory_enabled');
        
        await message.reply('Chat memory disabled.');
      }
      else if (action === 'clear') {
        if (args.length === 3) {
          const targetId = args[2];
          await clearChatMemory(targetId);
          await message.reply(`Chat memory cleared for user <@${targetId}>.`);
        } else {
          await message.reply('Usage: /memory clear [user_id]');
        }
      }
      else if (action === 'limit') {
        if (args.length === 3) {
          const limit = parseInt(args[2]);
          
          if (!isNaN(limit) && limit > 0) {
            config.memoryLimit = limit;
            // Update in database if config table exists
            await supabase
              .from('config')
              .upsert({ key: 'memory_limit', value: limit })
              .eq('key', 'memory_limit');
            
            await message.reply(`Memory limit updated to ${limit} conversations per user.`);
          } else {
            await message.reply('Invalid limit. Please provide a positive number.');
          }
        } else {
          await message.reply('Usage: /memory limit [number]');
        }
      }
      else if (action === 'status') {
        const status = config.memoryEnabled ? 'enabled' : 'disabled';
        await message.reply(`Chat memory is currently ${status} with a limit of ${config.memoryLimit} conversations per user.`);
      }
      else {
        await message.reply('Usage: /memory enable|disable|clear|limit|status [options]');
      }
    } else {
      await message.reply('Usage: /memory enable|disable|clear|limit|status [options]');
    }
  }
}

// When the bot is ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Load config from database
  await loadConfig();
  
  // Set bot status
  client.user.setActivity('with DMS.EXE 🎮');
});

// Message handling
client.on('messageCreate', async (message) => {
  // Ignore messages from the bot itself
  if (message.author.bot) return;
  
  // Check if this is a DM
  const isDM = message.channel.type === ChannelType.DM;
  
  // Process commands in DMs
  if (isDM && message.content.startsWith('/')) {
    await processCommand(message);
    return;
  }
  
  // Check if the bot should respond
  const shouldRespond = 
    // In a DM channel
    isDM || 
    // Mentioned the bot
    message.mentions.has(client.user.id) ||
    // In a dedicated channel and not using a command
    (config.allowedChannels.includes(message.channel.id) && !message.content.startsWith('/'));
  
  if (!shouldRespond) return;
  
  // Check if the user is allowed to use the bot
  const userId = message.author.id;
  const isUserAdmin = isAdmin(userId);
  const isUserWhitelisted = isWhitelisted(userId);
  
  if (!config.allowAll && !isUserAdmin && !isDM) {
    return; // Only respond to admins when not in all mode
  }
  
  // Check token usage for regular users
  if (!isUserWhitelisted) {
    const tokensUsed = await checkTokenUsage(userId);
    if (tokensUsed >= config.tokenLimit) {
      // Send error message and delete after 5 seconds
      const errorMsg = await message.reply(`<@${userId}> try again tomorrow, limit reached.`);
      setTimeout(() => {
        errorMsg.delete().catch(console.error);
      }, 5000);
      return;
    }
  }
  
  // Extract the actual message without the mention
  let userMessage = message.content;
  const mentionRegex = new RegExp(`<@!?${client.user.id}>`, 'g');
  userMessage = userMessage.replace(mentionRegex, '').trim();
  
  // Don't process empty messages
  if (!userMessage) return;
  
  // Generate response with typing indicator
  await withTypingIndicator(message.channel, async () => {
    try {
      const response = await generateResponse(userMessage, userId);
      await message.reply(response.text);
    } catch (error) {
      console.error('Error:', error);
      await message.reply('Sorry, I encountered an error processing your request.');
    }
  });
});

// Start Express server
app.get('/', (req, res) => {
  res.send('DMS.EXE Discord Bot is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
