require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, Partials, ChannelType, EmbedBuilder } = require('discord.js');
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
  xpEnabled: false, // XP system disabled by default
  botSilenced: false, // Bot silence mode
};

// XP Configuration
const XP_CONFIG = {
  xpPerMessage: 8,
  cooldownMs: 5000, // 5 seconds
};

// Parse admin and whitelist IDs from environment variables
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
const WHITELIST_IDS = process.env.WHITELIST_IDS ? process.env.WHITELIST_IDS.split(',') : [];

// DMS.EXE information for the bot
const BOT_INFO = {
  creator: {
    name: "DMS.EXE",
    handle: "@its.justdms",
    description: "I serve DMS, a content creator known for gaming videos."
  }
};

// XP Rank thresholds
const RANKS = [
  { name: 'Bronze', min: 1, max: 4 }, 
  { name: 'Silver', min: 5, max: 9 },
  { name: 'Gold', min: 10, max: 14 }, 
  { name: 'Platinum', min: 15, max: 19 },
  { name: 'Diamond', min: 20, max: 29 }, 
  { name: 'Heroic', min: 30, max: 39 },
  { name: 'Elite Heroic', min: 40, max: 49 }, 
  { name: 'Master', min: 50, max: 59 },
  { name: 'Elite Master', min: 60, max: 69 }, 
  { name: 'Grandmaster 1', min: 70, max: 74 },
  { name: 'Grandmaster 2', min: 75, max: 79 }, 
  { name: 'Grandmaster 3', min: 80, max: 84 },
  { name: 'Grandmaster 4', min: 85, max: 89 }, 
  { name: 'Grandmaster 5', min: 90, max: 94 },
  { name: 'Grandmaster 6', min: 95, max: 100 }
];

// XP Helper Functions
function xpNeededForLevel(level) {
  return Math.round(0.9344 * Math.pow(level, 2) + 39.0656);
}

function totalXpForLevel(level) {
  let totalXp = 0;
  for (let i = 1; i <= level; i++) totalXp += xpNeededForLevel(i);
  return totalXp;
}

function getRankForLevel(level) {
  for (const rank of RANKS) {
    if (level >= rank.min && level <= rank.max) return rank.name;
  }
  return RANKS[RANKS.length - 1].name;
}

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

// ==================== XP SYSTEM FUNCTIONS ====================

// Function to get or create user XP record
async function getUserXP(userId, username) {
  try {
    const { data, error } = await supabase
      .from('user_xp')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code === 'PGRST116') {
      // User doesn't exist, create new record
      const newUser = {
        user_id: userId,
        username: username,
        xp: 0,
        level: 1,
        rank: 'Bronze',
        last_message_time: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const { data: insertData, error: insertError } = await supabase
        .from('user_xp')
        .insert([newUser])
        .select()
        .single();
      
      if (insertError) {
        console.error('Error creating user XP record:', insertError);
        return null;
      }
      
      return insertData;
    }
    
    if (error) {
      console.error('Error fetching user XP:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in getUserXP:', error);
    return null;
  }
}

// Function to award XP to user
async function awardXP(userId, username) {
  try {
    if (!config.xpEnabled) return;
    
    const user = await getUserXP(userId, username);
    if (!user) return;
    
    // Check cooldown
    const now = Date.now();
    if (user.last_message_time && (now - parseInt(user.last_message_time)) < XP_CONFIG.cooldownMs) {
      return; // Still on cooldown
    }
    
    const newXp = user.xp + XP_CONFIG.xpPerMessage;
    let newLevel = user.level;
    
    // Calculate new level
    while (newXp >= totalXpForLevel(newLevel + 1)) {
      newLevel++;
    }
    
    const newRank = getRankForLevel(newLevel);
    
    // Update user record
    const { error } = await supabase
      .from('user_xp')
      .update({
        username: username,
        xp: newXp,
        level: newLevel,
        rank: newRank,
        last_message_time: now.toString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error updating user XP:', error);
    }
    
  } catch (error) {
    console.error('Error awarding XP:', error);
  }
}

// Function to get leaderboard
async function getLeaderboard(limit = 10) {
  try {
    const { data, error } = await supabase
      .from('user_xp')
      .select('*')
      .order('xp', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error fetching leaderboard:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Error in getLeaderboard:', error);
    return [];
  }
}

// ==================== CHAT MEMORY FUNCTIONS ====================

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
      if (error.code === 'PGRST116') {
        return [];
      }
      console.error('Error fetching chat memory:', error);
      return [];
    }
    
    return data?.memory || [];
  } catch (error) {
    console.error('Error getting chat memory:', error);
    return [];
  }
}

// Function to store a new conversation in chat memory
async function storeChatMemory(userId, userMessage, botResponse) {
  try {
    const { data, error } = await supabase
      .from('chat_memory')
      .select('memory')
      .eq('user_id', userId)
      .single();
      
    const newMemory = {
      user_message: userMessage,
      bot_response: botResponse,
      timestamp: new Date().toISOString()
    };
    
    let memories = [];
    const currentTime = new Date().toISOString();
    
    if (error) {
      memories = [newMemory];
      
      try {
        const { error: rpcError } = await supabase.rpc('create_chat_memory', {
          p_user_id: userId,
          p_last_message: userMessage,
          p_memory: memories,
          p_updated_at: currentTime
        });
        
        if (rpcError) {
          console.error('Error with RPC create_chat_memory:', rpcError);
          
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
      memories = data?.memory || [];
      memories.unshift(newMemory);
      
      if (memories.length > config.memoryLimit) {
        memories = memories.slice(0, config.memoryLimit);
      }
      
      try {
        const { error: rpcError } = await supabase.rpc('update_chat_memory', {
          p_user_id: userId,
          p_last_message: userMessage,
          p_memory: memories,
          p_updated_at: currentTime
        });
        
        if (rpcError) {
          console.error('Error with RPC update_chat_memory:', rpcError);
          
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
  
  let memoryText = 'Previous conversations:\n';
  memories.forEach((memory, index) => {
    memoryText += `User: ${memory.user_message}\n`;
    memoryText += `Assistant: ${memory.bot_response}\n`;
    
    if (index < memories.length - 1) {
      memoryText += '\n';
    }
  });
  
  return memoryText;
}

// Function to clear chat memory for a user
async function clearChatMemory(userId) {
  try {
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
    }
    
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

// ==================== AI RESPONSE GENERATION ====================

// Function to generate response from Together API
async function generateResponse(prompt, userId) {
  try {
    let chatMemory = '';
    if (config.memoryEnabled) {
      const memories = await getChatMemory(userId);
      chatMemory = formatChatMemory(memories);
    }
    
    const apiPrompt = `You are a helpful assistant serving DMS (${BOT_INFO.creator.handle}).
${BOT_INFO.creator.description}
Be helpful and concise.

If someone asks about sensitivity or sensitivity settings, direct them to send their device name to #test channel.

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

    const tokensUsed = response.data.usage.total_tokens;
    
    if (!isWhitelisted(userId)) {
      await updateTokenUsage(userId, tokensUsed);
    }
    
    const responseText = response.data.choices[0].text.trim();
    
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

// ==================== TOKEN USAGE FUNCTIONS ====================

// Load config from database
async function loadConfig() {
  try {
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
      const envChannels = process.env.DEDICATED_CHANNELS ? process.env.DEDICATED_CHANNELS.split(',') : [];
      
      if (Array.isArray(allowedChannels.value)) {
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
    
    // Load XP system status
    const { data: xpEnabled, error: xpEnabledError } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'xp_enabled')
      .single();
    
    if (!xpEnabledError && xpEnabled !== null) {
      config.xpEnabled = xpEnabled.value;
    }
    
    // Load bot silence status
    const { data: botSilenced, error: botSilencedError } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'bot_silenced')
      .single();
    
    if (!botSilencedError && botSilenced !== null) {
      config.botSilenced = botSilenced.value;
    }
    
    console.log('Config loaded from database:', config);
  } catch (error) {
    console.error('Error loading config:', error);
  }
}

// Function to check and update token usage
async function checkTokenUsage(userId) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
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
    
    const lastReset = new Date(user.last_reset);
    const today = new Date();
    if (lastReset.getDate() !== today.getDate() || 
        lastReset.getMonth() !== today.getMonth() || 
        lastReset.getFullYear() !== today.getFullYear()) {
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
    const currentUsage = await checkTokenUsage(userId);
    
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
    const currentUsage = await checkTokenUsage(userId);
    const newUsage = Math.max(0, currentUsage - amount);
    
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

// ==================== COMMAND PROCESSING ====================

// Function to process commands
async function processCommand(message) {
  const content = message.content.trim();
  const userId = message.author.id;
  
  // Only admins can use commands in DMs
  if (!isAdmin(userId)) {
    return;
  }
  
  if (content.startsWith('/stop')) {
    config.botSilenced = true;
    await supabase
      .from('config')
      .upsert({ key: 'bot_silenced', value: true });
    await message.reply('Bot is now completely silenced. Use any other command to reactivate.');
  }
  else if (content.startsWith('/xp') && !content.startsWith('/xpstop')) {
    config.xpEnabled = true;
    await supabase
      .from('config')
      .upsert({ key: 'xp_enabled', value: true });
    await message.reply('XP system activated! Users will now gain XP silently for their messages.');
  }
  else if (content.startsWith('/xpstop')) {
    config.xpEnabled = false;
    await supabase
      .from('config')
      .upsert({ key: 'xp_enabled', value: false });
    await message.reply('XP system stopped.');
  }
  else if (content.startsWith('/leaderboard')) {
    const leaderboard = await getLeaderboard(10);
    
    if (leaderboard.length === 0) {
      await message.reply('No users have gained XP yet.');
      return;
    }
    
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('🏆 Server Leaderboard 🏆')
      .setDescription('Top 10 most active members')
      .setTimestamp()
      .setFooter({ text: 'XP Leaderboard • DMS Server' });
    
    let leaderboardText = leaderboard.map((user, index) => {
      let medal = (index === 0) ? '🥇' : (index === 1) ? '🥈' : (index === 2) ? '🥉' : `${index + 1}.`;
      return `${medal} **${user.username}** • Level: **${user.level}** • XP: **${user.xp}** • Rank: **${user.rank}**`;
    }).join('\n\n');
    
    embed.addFields({ name: 'Rankings', value: leaderboardText });
    
    await message.reply({ embeds: [embed] });
  }
  else if (content.startsWith('/admin')) {
    // Reactivate bot if silenced
    config.botSilenced = false;
    await supabase
      .from('config')
      .upsert({ key: 'bot_silenced', value: false });
    
    await message.reply('Admin mode activated. I will only respond to admins now.');
    config.allowAll = false;
    await supabase
      .from('config')
      .update({ value: false })
      .eq('key', 'allow_all');
  } 
  else if (content.startsWith('/all')) {
    // Reactivate bot if silenced
    config.botSilenced = false;
    await supabase
      .from('config')
      .upsert({ key: 'bot_silenced', value: false });
    
    await message.reply('All users mode activated. I will respond to everyone now.');
    config.allowAll = true;
    await supabase
      .from('config')
      .update({ value: true })
      .eq('key', 'allow_all');
  }
  else if (content.startsWith('/channel')) {
    // Reactivate bot if silenced
    config.botSilenced = false;
    await supabase
      .from('config')
      .upsert({ key: 'bot_silenced', value: false });
    
    const args = content.split(' ');
    if (args.length === 3) {
      const action = args[1];
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
    // Reactivate bot if silenced
    config.botSilenced = false;
    await supabase
      .from('config')
      .upsert({ key: 'bot_silenced', value: false });
    
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
    // Reactivate bot if silenced
    config.botSilenced = false;
    await supabase
      .from('config')
      .upsert({ key: 'bot_silenced', value: false });
    
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
    // Reactivate bot if silenced
    config.botSilenced = false;
    await supabase
      .from('config')
      .upsert({ key: 'bot_silenced', value: false });
    
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
    // Reactivate bot if silenced
    config.botSilenced = false;
    await supabase
      .from('config')
      .upsert({ key: 'bot_silenced', value: false });
    
    const args = content.split(' ');
    
    if (args.length >= 2) {
      const action = args[1];
      
      if (action === 'enable') {
        config.memoryEnabled = true;
        await supabase
          .from('config')
          .upsert({ key: 'memory_enabled', value: true });
        
        await message.reply('Chat memory enabled.');
      } 
      else if (action === 'disable') {
        config.memoryEnabled = false;
        await supabase
          .from('config')
          .upsert({ key: 'memory_enabled', value: false });
        
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
            await supabase
              .from('config')
              .upsert({ key: 'memory_limit', value: limit });
            
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
  else {
    // Any other command reactivates the bot if silenced
    config.botSilenced = false;
    await supabase
      .from('config')
      .upsert({ key: 'bot_silenced', value: false });
  }
}

// ==================== BOT EVENT HANDLERS ====================

// When the bot is ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Load config from database
  await loadConfig();
  
  // Set bot status
  client.user.setActivity('serving DMS 🎮');
});

// Message handling
client.on('messageCreate', async (message) => {
  // Ignore messages from the bot itself
  if (message.author.bot) return;
  
  // Check if this is a DM
  const isDM = message.channel.type === ChannelType.DM;
  
  // Process commands in DMs (only for admins)
  if (isDM && message.content.startsWith('/')) {
    await processCommand(message);
    return;
  }
  
  // If bot is silenced, don't respond to anything except admin DM commands
  if (config.botSilenced) return;
  
  // Check for @everyone or @here mentions outside dedicated channels
  const hasEveryoneHere = message.content.includes('@everyone') || message.content.includes('@here');
  const isInDedicatedChannel = config.allowedChannels.includes(message.channel.id);
  
  if (hasEveryoneHere && !isInDedicatedChannel && !isDM) {
    return; // Don't respond to @everyone/@here outside dedicated channels
  }
  
  // Award XP if system is enabled and not in DM
  if (!isDM && config.xpEnabled) {
    await awardXP(message.author.id, message.author.username);
  }
  
  // Check if the bot should respond to the message
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
  res.send('DMS Discord Bot is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
