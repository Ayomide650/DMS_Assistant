require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, Partials, ChannelType, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
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
    GatewayIntentBits.GuildMembers,
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
  characterLimit: 90, // Default character limit for responses
  xpEnabled: false, // XP system disabled by default
  botSilenced: false, // Bot silence mode
  maintenanceMode: false, // Maintenance mode
  commandPrefix: '/', // Default command prefix
  startTime: Date.now(), // Bot start time for uptime calculation
};

// XP Configuration
const XP_CONFIG = {
  xpPerMessage: 8,
  cooldownMs: 5000, // 5 seconds
};

// Bot Info
const BOT_VERSION = '3.5';
const BOT_DEVELOPERS = 'DMP Engineer, yilspain(.)';
const BOT_OWNER = 'justdms';

// Parse admin and whitelist IDs from environment variables
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
const WHITELIST_IDS = process.env.WHITELIST_IDS ? process.env.WHITELIST_IDS.split(',') : [];

// DMS.EXE information for the bot
const BOT_INFO = {
  creator: {
    name: "DMS.EXE",
    handle: "@its.justdms",
    description: "I serve DMS, a content creator known for gaming videos, especially Free Fire content."
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

// Store for pending item creations and active giveaways
const pendingItems = new Map();
const activeGiveaways = new Map();

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

// Function to check if user is bot admin
function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

// Function to check if user is server admin
function isServerAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
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

// ==================== GIVEAWAY FUNCTIONS ====================

// Function to save giveaway item
async function saveGiveawayItem(name, imageUrl) {
  try {
    const { error } = await supabase
      .from('giveaway_items')
      .upsert({
        name: name.toLowerCase(),
        display_name: name,
        image_url: imageUrl,
        created_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Error saving giveaway item:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error in saveGiveawayItem:', error);
    return false;
  }
}

// Function to get giveaway item
async function getGiveawayItem(name) {
  try {
    const { data, error } = await supabase
      .from('giveaway_items')
      .select('*')
      .eq('name', name.toLowerCase())
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error getting giveaway item:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in getGiveawayItem:', error);
    return null;
  }
}

// Function to create giveaway
async function createGiveaway(guildId, channelId, messageId, itemName, imageUrl) {
  try {
    const { data, error } = await supabase
      .from('active_giveaways')
      .insert({
        guild_id: guildId,
        channel_id: channelId,
        message_id: messageId,
        item_name: itemName,
        image_url: imageUrl,
        participants: [],
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating giveaway:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in createGiveaway:', error);
    return null;
  }
}

// Function to add participant to giveaway
async function addGiveawayParticipant(messageId, userId) {
  try {
    const { data: giveaway, error: fetchError } = await supabase
      .from('active_giveaways')
      .select('*')
      .eq('message_id', messageId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching giveaway:', fetchError);
      return false;
    }
    
    const participants = giveaway.participants || [];
    
    if (participants.includes(userId)) {
      return false; // Already participating
    }
    
    participants.push(userId);
    
    const { error: updateError } = await supabase
      .from('active_giveaways')
      .update({ participants })
      .eq('message_id', messageId);
    
    if (updateError) {
      console.error('Error updating giveaway participants:', updateError);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in addGiveawayParticipant:', error);
    return false;
  }
}

// Function to get giveaway participants
async function getGiveawayParticipants(messageId) {
  try {
    const { data, error } = await supabase
      .from('active_giveaways')
      .select('participants')
      .eq('message_id', messageId)
      .single();
    
    if (error) {
      console.error('Error getting giveaway participants:', error);
      return [];
    }
    
    return data.participants || [];
  } catch (error) {
    console.error('Error in getGiveawayParticipants:', error);
    return [];
  }
}

// Function to end giveaway and pick winner
async function endGiveaway(messageId) {
  try {
    const { data: giveaway, error } = await supabase
      .from('active_giveaways')
      .select('*')
      .eq('message_id', messageId)
      .single();
    
    if (error) {
      console.error('Error fetching giveaway for ending:', error);
      return null;
    }
    
    const participants = giveaway.participants || [];
    
    if (participants.length === 0) {
      return { winner: null, participants: [] };
    }
    
    const winnerId = participants[Math.floor(Math.random() * participants.length)];
    
    // Delete the giveaway from active giveaways
    await supabase
      .from('active_giveaways')
      .delete()
      .eq('message_id', messageId);
    
    return { winner: winnerId, participants, itemName: giveaway.item_name };
  } catch (error) {
    console.error('Error in endGiveaway:', error);
    return null;
  }
}

// ==================== EXISTING FUNCTIONS (AFK, WARNINGS, XP, etc.) ====================

// Function to set/get AFK status
async function setAFK(userId, reason) {
  try {
    const { error } = await supabase
      .from('afk_users')
      .upsert({
        user_id: userId,
        reason: reason,
        timestamp: new Date().toISOString()
      });
    
    if (error) {
      console.error('Error setting AFK:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error in setAFK:', error);
    return false;
  }
}

async function removeAFK(userId) {
  try {
    const { error } = await supabase
      .from('afk_users')
      .delete()
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error removing AFK:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error in removeAFK:', error);
    return false;
  }
}

async function getAFK(userId) {
  try {
    const { data, error } = await supabase
      .from('afk_users')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error getting AFK:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in getAFK:', error);
    return null;
  }
}

// Function to add warning
async function addWarning(userId, reason, adminId) {
  try {
    const { error } = await supabase
      .from('user_warnings')
      .insert({
        user_id: userId,
        reason: reason,
        admin_id: adminId,
        timestamp: new Date().toISOString()
      });
    
    if (error) {
      console.error('Error adding warning:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error in addWarning:', error);
    return false;
  }
}

// Function to get warning count
async function getWarningCount(userId) {
  try {
    const { data, error } = await supabase
      .from('user_warnings')
      .select('*')
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error getting warnings:', error);
      return 0;
    }
    
    return data ? data.length : 0;
  } catch (error) {
    console.error('Error in getWarningCount:', error);
    return 0;
  }
}

// Function to get bot ping
function getBotPing() {
  return client.ws.ping;
}

// Function to check if user can use rank command (once per day)
async function canUseRankCommand(userId) {
  try {
    const { data, error } = await supabase
      .from('rank_usage')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code === 'PGRST116') {
      // User doesn't exist, create new record
      await supabase
        .from('rank_usage')
        .insert({
          user_id: userId,
          last_used: new Date().toISOString()
        });
      return true;
    }
    
    if (error) {
      console.error('Error checking rank usage:', error);
      return false;
    }
    
    // Check if 24 hours have passed
    const lastUsed = new Date(data.last_used);
    const now = new Date();
    const timeDiff = now - lastUsed;
    const hoursDiff = timeDiff / (1000 * 60 * 60);
    
    if (hoursDiff >= 24) {
      // Update last used time
      await supabase
        .from('rank_usage')
        .update({ last_used: now.toISOString() })
        .eq('user_id', userId);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error in canUseRankCommand:', error);
    return false;
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
    if (!config.xpEnabled || config.maintenanceMode) return;
    
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

// ==================== TOKEN USAGE FUNCTIONS ====================

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
    return 0; // Return 0 on error to allow continued operation
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
    return 0; // Return 0 on error to allow continued operation
  }
}

// Function to get uptime
function getUptime() {
  const uptimeMs = Date.now() - config.startTime;
  const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
  const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

// Function to get XP system stats
async function getXPStats() {
  try {
    const { data: users, error } = await supabase
      .from('user_xp')
      .select('*');
    
    if (error) {
      console.error('Error fetching XP stats:', error);
      return null;
    }
    
    const totalUsers = users?.length || 0;
    const topUser = users?.sort((a, b) => b.xp - a.xp)[0];
    
    // Get today's messages (approximate based on recent activity)
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentUsers = users?.filter(user => 
      parseInt(user.last_message_time) > oneDayAgo
    ) || [];
    
    return {
      totalUsers,
      topUser,
      recentMessages: recentUsers.length * 5 // Approximate
    };
  } catch (error) {
    console.error('Error getting XP stats:', error);
    return null;
  }
}

// Function to delete user XP data
async function purgeUserXP(userId) {
  try {
    const { error } = await supabase
      .from('user_xp')
      .delete()
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error purging user XP:', error);
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error purging user XP:', error);
    throw error;
  }
}

// Function to check if message is asking about sensitivity
function isSensitivityQuestion(message) {
  const sensitivityKeywords = [
    'sensitivity', 'sens', 'dpi', 'aim', 'mouse settings', 
    'aim settings', 'config', 'setup', 'mouse config'
  ];
  
  const lowerMessage = message.toLowerCase();
  return sensitivityKeywords.some(keyword => lowerMessage.includes(keyword));
}

// Function to truncate response to character limit
function truncateResponse(text, maxLength = config.characterLimit) {
  if (text.length <= maxLength) {
    return text;
  }
  
  // Find the last complete word within the limit
  const truncated = text.substring(0, maxLength - 3); // Leave space for "..."
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.5) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  // If no good word break, just truncate
  return truncated + '...';
}

// Function to generate response from Together API
async function generateResponse(prompt, userId) {
  try {
    // Check if it's a sensitivity question
    if (isSensitivityQuestion(prompt)) {
      return {
        text: "If you need sensitivity settings, please send your device name to the test channel and wait for assistance! 🎮",
        tokensUsed: 0
      };
    }
    
    const apiPrompt = `You are a helpful AI assistant for a gaming community. Respond naturally and directly to the user's message. Keep responses concise (under ${config.characterLimit} characters). Be helpful and friendly.

User: ${prompt}
Assistant:`;

    const response = await axios.post(
      'https://api.together.xyz/v1/completions',
      {
        model: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free',
        prompt: apiPrompt,
        max_tokens: 50,
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
    
    // Truncate response to fit character limit
    const truncatedResponse = truncateResponse(responseText);
    
    return {
      text: truncatedResponse,
      tokensUsed
    };
  } catch (error) {
    console.error('Error generating response:', error);
    throw error;
  }
}

// ==================== CONFIG FUNCTIONS ====================

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
    
    const { data: characterLimit, error: characterLimitError } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'character_limit')
      .single();
    
    if (!characterLimitError && characterLimit) {
      config.characterLimit = characterLimit.value;
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
    
    // Load maintenance mode status
    const { data: maintenanceMode, error: maintenanceModeError } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'maintenance_mode')
      .single();
    
    if (!maintenanceModeError && maintenanceMode !== null) {
      config.maintenanceMode = maintenanceMode.value;
    }
    
    // Load command prefix
    const { data: commandPrefix, error: commandPrefixError } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'command_prefix')
      .single();
    
    if (!commandPrefixError && commandPrefix) {
      config.commandPrefix = commandPrefix.value;
    }
    
    console.log('Config loaded from database:', config);
  } catch (error) {
    console.error('Error loading config:', error);
  }
}

// ==================== COMMAND PROCESSING ====================

// Function to process commands
async function processCommand(message) {
  const content = message.content.trim();
  const userId = message.author.id;
  const isDM = message.channel.type === ChannelType.DM;
  const isInDedicatedChannel = config.allowedChannels.includes(message.channel.id);
  
  // Check if message starts with current prefix
  if (!content.startsWith(config.commandPrefix)) return;
  
  // Remove prefix from command
  const commandContent = content.slice(config.commandPrefix.length);
  const args = commandContent.split(' ');
  const command = args[0].toLowerCase();

  // Handle /item command (bot admin only, DM only)
  if (command === 'item' && isAdmin(userId) && isDM) {
    await message.reply('Please send the name of the item you want to add to the giveaway system:');
    pendingItems.set(userId, { step: 'waiting_for_name' });
    return;
  }

  // Handle /giveaway command (server admins only, server channels only)
  if (command === 'giveaway' && !isDM) {
    const member = message.guild.members.cache.get(userId);
    if (!member || !isServerAdmin(member)) {
      await message.reply('❌ You need Administrator permissions to use this command!');
      return;
    }

    if (args.length < 2) {
      await message.reply(`Usage: ${config.commandPrefix}giveaway [item name]\nExample: ${config.commandPrefix}giveaway booyah pass`);
      return;
    }

    const itemName = args.slice(1).join(' ');
    const item = await getGiveawayItem(itemName);

    if (!item) {
      await message.reply(`❌ Item "${itemName}" not found! Ask a bot admin to add it using ${config.commandPrefix}item in DMs.`);
      return;
    }

    // Create giveaway embed
    const embed = new EmbedBuilder()
      .setColor('#FF6B6B')
      .setTitle(`🎉 FREE FIRE GIVEAWAY!`)
      .setDescription(`${winners > 1 ? `${winners} lucky people` : 'One lucky person'} will win **${item.display_name}** in Free Fire! Participate now!\n\nClick 🎁 to participate!`)
      .setImage(item.image_url)
      .setFooter({ text: `Winners: ${winners} | Ends when admin types "start"` })
      .setTimestamp();

    // Create buttons
    const participateButton = new ButtonBuilder()
      .setCustomId('giveaway_participate')
      .setLabel('🎁 Participate')
      .setStyle(ButtonStyle.Primary);

    const participantsButton = new ButtonBuilder()
      .setCustomId('giveaway_participants')
      .setLabel('👥 Participants')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder()
      .addComponents(participateButton, participantsButton);

    // Send giveaway message with @everyone mention
    const giveawayMessage = await message.channel.send({
      content: '@everyone',
      embeds: [embed],
      components: [row]
    });

    // Save giveaway to database
    const giveaway = await createGiveaway(
      message.guild.id,
      message.channel.id,
      giveawayMessage.id,
      item.display_name,
      item.image_url,
      winners
    );

    if (giveaway) {
      await message.reply(`✅ Giveaway for **${item.display_name}** has been created with ${winners} winner${winners > 1 ? 's' : ''}! Type "start" while replying to the giveaway message to end it.`);
  // Handle "start" command for ending giveaways (server admins only)
  if (command === 'start' && !isDM && message.reference) {
    const member = message.guild.members.cache.get(userId);
    if (!member || !isServerAdmin(member)) {
      await message.reply('❌ You need Administrator permissions to start giveaways!');
      return;
    }

    try {
      const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
      const result = await endGiveaway(referencedMessage.id);

      if (!result) {
        await message.reply('❌ No active giveaway found for this message!');
        return;
      }

      if (result.participants.length === 0) {
        await message.reply('❌ No one participated in this giveaway!');
        return;
      }

      // Pick multiple winners if specified
      const winners = [];
      const participantsCopy = [...result.participants];
      const winnersCount = Math.min(result.winnersCount || 1, participantsCopy.length);

      for (let i = 0; i < winnersCount; i++) {
        const randomIndex = Math.floor(Math.random() * participantsCopy.length);
        winners.push(participantsCopy[randomIndex]);
        participantsCopy.splice(randomIndex, 1);
      }

      // Create winners announcement
      const winnerMentions = winners.map(winnerId => `<@${winnerId}>`).join(', ');
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🎉 GIVEAWAY ENDED!')
        .setDescription(`Congratulations to the ${winners.length > 1 ? 'winners' : 'winner'}!\n\n🏆 **${winnerMentions}**\n\nYou won: **${result.itemName}**!`)
        .setFooter({ text: `Total participants: ${result.participants.length}` })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
      await message.reply(`✅ Giveaway ended! ${winners.length} winner${winners.length > 1 ? 's' : ''} selected.`);
    } catch (error) {
      console.error('Error ending giveaway:', error);
      await message.reply('❌ Error ending giveaway. Please try again.');
    }
    return;
  }

  // Other existing commands...
  if (command === 'ping') {
    const ping = getBotPing();
    await message.reply(`🏓 Pong! Bot latency: ${ping}ms`);
    return;
  }

  if (command === 'uptime') {
    const uptime = getUptime();
    await message.reply(`⏰ Bot uptime: ${uptime}`);
    return;
  }

  if (command === 'version') {
    await message.reply(`🤖 Bot version: ${BOT_VERSION}`);
    return;
  }

  if (command === 'commands' || command === 'help') {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('📋 Available Commands')
      .setDescription('Here are all the available commands:')
      .addFields(
        { name: '🎮 General Commands', value: `${config.commandPrefix}ping - Check bot latency\n${config.commandPrefix}uptime - Check bot uptime\n${config.commandPrefix}version - Check bot version\n${config.commandPrefix}commands - Show this help menu`, inline: false },
        { name: '🎁 Giveaway Commands (Server Admins)', value: `${config.commandPrefix}giveaway [item] [winners] - Start a giveaway\n${config.commandPrefix}start - End giveaway (reply to giveaway message)`, inline: false },
        { name: '⚙️ Admin Commands (Bot Admins)', value: `${config.commandPrefix}item - Add giveaway item (DM only)`, inline: false },
        { name: '📊 XP System', value: `${config.commandPrefix}rank - Check your rank\n${config.commandPrefix}leaderboard - View top players`, inline: false },
        { name: '💤 AFK System', value: `${config.commandPrefix}afk [reason] - Set AFK status\nMention someone to check their AFK status`, inline: false }
      )
      .setFooter({ text: `Bot Owner: ${BOT_OWNER} | Developers: ${BOT_DEVELOPERS}` });
    
    await message.reply({ embeds: [embed] });
    return;
  }

  // AFK command
  if (command === 'afk') {
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const success = await setAFK(userId, reason);
    
    if (success) {
      await message.reply(`💤 You are now AFK: ${reason}`);
    } else {
      await message.reply('❌ Failed to set AFK status!');
    }
    return;
  }

  // Rank command (once per day)
  if (command === 'rank') {
    if (!config.xpEnabled) {
      await message.reply('❌ XP system is currently disabled!');
      return;
    }

    const canUse = await canUseRankCommand(userId);
    if (!canUse) {
      await message.reply('⏰ You can only use the rank command once per day!');
      return;
    }

    const userXP = await getUserXP(userId, message.author.username);
    if (!userXP) {
      await message.reply('❌ Error fetching your XP data!');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🏆 Your Rank')
      .setThumbnail(message.author.displayAvatarURL())
      .addFields(
        { name: 'Level', value: userXP.level.toString(), inline: true },
        { name: 'XP', value: userXP.xp.toString(), inline: true },
        { name: 'Rank', value: userXP.rank, inline: true }
      )
      .setFooter({ text: 'You can use this command once per day' });

    await message.reply({ embeds: [embed] });
    return;
  }

  // Leaderboard command
  if (command === 'leaderboard' || command === 'lb') {
    if (!config.xpEnabled) {
      await message.reply('❌ XP system is currently disabled!');
      return;
    }

    const leaderboard = await getLeaderboard(10);
    if (leaderboard.length === 0) {
      await message.reply('📊 No XP data available yet!');
      return;
    }

    let description = '';
    leaderboard.forEach((user, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      description += `${medal} **${user.username}** - Level ${user.level} (${user.xp} XP)\n`;
    });

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🏆 XP Leaderboard')
      .setDescription(description)
      .setFooter({ text: 'Top 10 players by XP' });

    await message.reply({ embeds: [embed] });
    return;
  }

  // Admin commands
  if (isAdmin(userId)) {
    if (command === 'stats') {
      const xpStats = await getXPStats();
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('📊 Bot Statistics')
        .addFields(
          { name: 'Bot Version', value: BOT_VERSION, inline: true },
          { name: 'Uptime', value: getUptime(), inline: true },
          { name: 'Latency', value: `${getBotPing()}ms`, inline: true },
          { name: 'XP System', value: config.xpEnabled ? 'Enabled' : 'Disabled', inline: true },
          { name: 'Maintenance Mode', value: config.maintenanceMode ? 'ON' : 'OFF', inline: true },
          { name: 'Bot Silenced', value: config.botSilenced ? 'YES' : 'NO', inline: true }
        );

      if (xpStats) {
        embed.addFields(
          { name: 'Total XP Users', value: xpStats.totalUsers.toString(), inline: true },
          { name: 'Top Player', value: xpStats.topUser ? `${xpStats.topUser.username} (${xpStats.topUser.xp} XP)` : 'None', inline: true },
          { name: 'Recent Messages', value: xpStats.recentMessages.toString(), inline: true }
        );
      }

      await message.reply({ embeds: [embed] });
      return;
    }

    if (command === 'toggle-xp') {
      config.xpEnabled = !config.xpEnabled;
      await supabase.from('config').upsert({ key: 'xp_enabled', value: config.xpEnabled });
      await message.reply(`✅ XP system ${config.xpEnabled ? 'enabled' : 'disabled'}!`);
      return;
    }

    if (command === 'silence') {
      config.botSilenced = !config.botSilenced;
      await supabase.from('config').upsert({ key: 'bot_silenced', value: config.botSilenced });
      await message.reply(`✅ Bot ${config.botSilenced ? 'silenced' : 'unsilenced'}!`);
      return;
    }

    if (command === 'maintenance') {
      config.maintenanceMode = !config.maintenanceMode;
      await supabase.from('config').upsert({ key: 'maintenance_mode', value: config.maintenanceMode });
      await message.reply(`✅ Maintenance mode ${config.maintenanceMode ? 'enabled' : 'disabled'}!`);
      return;
    }
// ==================== EVENT HANDLERS ====================

// Handle button interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId, user, message } = interaction;

  if (customId === 'giveaway_participate') {
    const success = await addGiveawayParticipant(message.id, user.id);
    
    if (success) {
      await interaction.reply({ content: '✅ You have been added to the giveaway!', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ You are already participating in this giveaway!', ephemeral: true });
    }
  } else if (customId === 'giveaway_participants') {
    const participants = await getGiveawayParticipants(message.id);
    
    if (participants.length === 0) {
      await interaction.reply({ content: '📝 No participants yet!', ephemeral: true });
      return;
    }

    const participantMentions = participants.map(id => `<@${id}>`).join('\n');
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('👥 Giveaway Participants')
      .setDescription(participantMentions)
      .setFooter({ text: `Total: ${participants.length} participants` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

// Handle messages
client.on('messageCreate', async (message) => {
  if (message.author.bot || !config.botEnabled) return;

  const userId = message.author.id;
  const isDM = message.channel.type === ChannelType.DM;
  const isInDedicatedChannel = config.allowedChannels.includes(message.channel.id);

  // Handle pending item creation (bot admin DM flow)
  if (isDM && pendingItems.has(userId) && isAdmin(userId)) {
    const pendingItem = pendingItems.get(userId);
    
    if (pendingItem.step === 'waiting_for_name') {
      pendingItem.name = message.content.trim();
      pendingItem.step = 'waiting_for_image';
      pendingItems.set(userId, pendingItem);
      await message.reply('Now please send the image for this item:');
      return;
    } else if (pendingItem.step === 'waiting_for_image') {
      if (message.attachments.size === 0) {
        await message.reply('❌ Please send an image!');
        return;
      }

      const attachment = message.attachments.first();
      if (!attachment.contentType?.startsWith('image/')) {
        await message.reply('❌ Please send a valid image file!');
        return;
      }

      const success = await saveGiveawayItem(pendingItem.name, attachment.url);
      
      if (success) {
        await message.reply(`✅ Giveaway item "${pendingItem.name}" has been saved successfully!`);
      } else {
        await message.reply('❌ Failed to save giveaway item! Please try again.');
      }
      
      pendingItems.delete(userId);
      return;
    }
  }

  // Award XP for regular messages (not commands)
  if (!message.content.startsWith(config.commandPrefix)) {
    await awardXP(userId, message.author.username);
  }

  // Handle AFK mentions
  if (message.mentions.users.size > 0) {
    for (const [mentionedUserId, mentionedUser] of message.mentions.users) {
      if (mentionedUserId === userId) continue; // Skip self-mentions
      
      const afkData = await getAFK(mentionedUserId);
      if (afkData) {
        const afkTime = new Date(afkData.timestamp);
        const timeDiff = Date.now() - afkTime.getTime();
        const hours = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        
        let timeString = '';
        if (hours > 0) timeString += `${hours}h `;
        timeString += `${minutes}m ago`;
        
        await message.reply(`💤 ${mentionedUser.username} is AFK: ${afkData.reason} (${timeString})`);
      }
    }
  }

  // Remove AFK status when user sends a message
  const afkData = await getAFK(userId);
  if (afkData) {
    await removeAFK(userId);
    await message.reply(`👋 Welcome back! Your AFK status has been removed.`);
  }

  // Process commands
  if (message.content.startsWith(config.commandPrefix)) {
    await processCommand(message);
    return;
  }

  // Handle AI responses (only in allowed channels or DMs, and if not silenced)
  if (config.botSilenced || config.maintenanceMode) return;

  const shouldRespond = isDM || isInDedicatedChannel || config.allowAll;
  
  if (!shouldRespond) return;

  // Check if bot is mentioned or replied to
  const isMentioned = message.mentions.has(client.user.id);
  const isReply = message.reference && message.reference.messageId;
  
  let isReplyToBot = false;
  if (isReply) {
    try {
      const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
      isReplyToBot = repliedMessage.author.id === client.user.id;
    } catch (error) {
      console.error('Error checking replied message:', error);
    }
  }

  if (!isMentioned && !isReplyToBot && !isDM) return;

  // Check token limits for non-whitelisted users
  if (!isWhitelisted(userId)) {
    const tokensUsed = await checkTokenUsage(userId);
    if (tokensUsed >= config.tokenLimit) {
      await message.reply(`❌ You've reached your daily token limit of ${config.tokenLimit}. Try again tomorrow!`);
      return;
    }
  }

  try {
    await withTypingIndicator(message.channel, async () => {
      let prompt = message.content;
      
      // Remove bot mention from prompt
      if (isMentioned) {
        prompt = prompt.replace(/<@!?\d+>/g, '').trim();
      }
      
      if (!prompt) {
        await message.reply('Hello! How can I help you?');
        return;
      }

      const response = await generateResponse(prompt, userId);
      
      if (response.text) {
        await message.reply(response.text);
      } else {
        await message.reply('Sorry, I couldn\'t generate a response. Please try again!');
      }
    });
  } catch (error) {
    console.error('Error generating response:', error);
    await message.reply('❌ Sorry, I encountered an error. Please try again later!');
  }
});

// Update createGiveaway function to include winners count
async function createGiveaway(guildId, channelId, messageId, itemName, imageUrl, winnersCount = 1) {
  try {
    const { data, error } = await supabase
      .from('active_giveaways')
      .insert({
        guild_id: guildId,
        channel_id: channelId,
        message_id: messageId,
        item_name: itemName,
        image_url: imageUrl,
        participants: [],
        winners_count: winnersCount,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating giveaway:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in createGiveaway:', error);
    return null;
  }
}

// Update endGiveaway function to include winners count
async function endGiveaway(messageId) {
  try {
    const { data: giveaway, error } = await supabase
      .from('active_giveaways')
      .select('*')
      .eq('message_id', messageId)
      .single();
    
    if (error) {
      console.error('Error fetching giveaway for ending:', error);
      return null;
    }
    
    const participants = giveaway.participants || [];
    
    if (participants.length === 0) {
      return { winner: null, participants: [], winnersCount: giveaway.winners_count };
    }
    
    // Delete the giveaway from active giveaways
    await supabase
      .from('active_giveaways')
      .delete()
      .eq('message_id', messageId);
    
    return { 
      winner: null, // Will be handled in the command handler
      participants, 
      itemName: giveaway.item_name,
      winnersCount: giveaway.winners_count || 1
    };
  } catch (error) {
    console.error('Error in endGiveaway:', error);
    return null;
  }
}

// Bot ready event
client.on('ready', async () => {
  console.log(`${client.user.tag} is online!`);
  console.log(`Bot version: ${BOT_VERSION}`);
  console.log(`Bot owner: ${BOT_OWNER}`);
  console.log(`Developers: ${BOT_DEVELOPERS}`);
  
  // Load configuration from database
  await loadConfig();
  
  // Set bot activity
  client.user.setActivity('Free Fire Community', { type: 'WATCHING' });
});

// Express server for health checks
app.get('/', (req, res) => {
  res.send('Discord bot is running!');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    uptime: getUptime(),
    version: BOT_VERSION,
    ping: getBotPing()
  });
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

// Handle process termination
process.on('SIGINT', () => {
  console.log('Shutting down bot...');
  client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});
