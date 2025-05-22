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
const BOT_VERSION = '3.3';
const BOT_DEVELOPERS = 'DMP Engineer, yilspain(.), justdms';

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

// ==================== NEW FEATURES FUNCTIONS ====================

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
        text: "If you need sensitivity settings, please send your device name to #test channel and wait for assistance! 🎮",
        tokensUsed: 0
      };
    }
    
    const apiPrompt = `You are a helpful AI assistant serving DMS (${BOT_INFO.creator.handle}).
${BOT_INFO.creator.description}

You have comprehensive knowledge about current events, world news, science, technology, history, culture, entertainment, sports, and all general topics. Be helpful, friendly, and conversational. Keep responses very short and concise (under ${config.characterLimit} characters).

Current date: ${new Date().toLocaleDateString()}

User: ${prompt}
Assistant:`;

    const response = await axios.post(
      'https://api.together.xyz/v1/completions',
      {
        model: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free',
        prompt: apiPrompt,
        max_tokens: 50, // Reduced for shorter responses
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
  
  // Handle /rank command (available to all users in dedicated channels only)
  if (command === 'rank' && isInDedicatedChannel && !isDM) {
    const canUse = await canUseRankCommand(userId);
    
    if (!canUse) {
      const errorMsg = await message.reply('❌ You can only use the /rank command once per day!');
      
      // Delete both messages after 20 seconds
      setTimeout(async () => {
        try {
          await message.delete();
          await errorMsg.delete();
        } catch (error) {
          console.error('Error deleting rank messages:', error);
        }
      }, 20000);
      return;
    }
    
    const user = await getUserXP(userId, message.author.username);
    
    if (!user || user.xp === 0) {
      const errorMsg = await message.reply('❌ You have no XP data. Start chatting to gain XP!');
      
      // Delete both messages after 20 seconds
      setTimeout(async () => {
        try {
          await message.delete();
          await errorMsg.delete();
        } catch (error) {
          console.error('Error deleting rank messages:', error);
        }
      }, 20000);
      return;
    }
    
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle(`🏆 ${message.author.username}'s Rank`)
      .addFields(
        { name: 'Level', value: user.level.toString(), inline: true },
        { name: 'Rank', value: user.rank, inline: true },
        { name: 'Total XP', value: user.xp.toLocaleString(), inline: true },
        { name: 'XP for Next Level', value: (totalXpForLevel(user.level + 1) - user.xp).toLocaleString(), inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'Next rank check available in 24 hours' });
    
    const rankMsg = await message.reply({ embeds: [embed] });
    
    // Delete both messages after 20 seconds
    setTimeout(async () => {
      try {
        await message.delete();
        await rankMsg.delete();
      } catch (error) {
        console.error('Error deleting rank messages:', error);
      }
    }, 20000);
    
    return;
  }
  
  // Handle /botinfo command (available to all users in dedicated channels)
  if (command === 'botinfo' && isInDedicatedChannel && !isDM) {
    const ping = getBotPing();
    const uptime = getUptime();
    
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('🤖 Bot Information')
      .addFields(
        { name: '📊 Version', value: BOT_VERSION, inline: true },
        { name: '👨‍💻 Developers', value: BOT_DEVELOPERS, inline: true },
        { name: '⏱️ Uptime', value: uptime, inline: true },
        { name: '📡 Ping', value: `${ping}ms`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'DMS Discord Bot' });
    
    await message.reply({ embeds: [embed] });
    return;
  }
  
  // Handle /leaderboard command (available to admins in any server channel)
  if (command === 'leaderboard' && isAdmin(userId) && !isDM) {
    const leaderboard = await getLeaderboard(10);
    
    if (leaderboard.length === 0) {
      await message.reply('No XP data found.');
      return;
    }
    
    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🏆 XP Leaderboard - Top 10')
      .setTimestamp();
    
    let description = '';
    leaderboard.forEach((user, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      description += `${medal} **${user.username}**\n`;
      description += `   Level ${user.level} (${user.rank}) - ${user.xp.toLocaleString()} XP\n\n`;
    });
    
    embed.setDescription(description);
    await message.reply({ embeds: [embed] });
    return;
  }
  
  // All other commands require admin privileges and some are DM-only
  if (!isAdmin(userId)) return;
  
  // DM-only admin commands
  if (isDM) {
    if (command === 'characterset') {
      if (args.length === 2) {
        const newLimit = parseInt(args[1]);
        if (isNaN(newLimit) || newLimit < 10 || newLimit > 500) {
          await message.reply('❌ Character limit must be a number between 10 and 500.');
          return;
        }
        
        config.characterLimit = newLimit;
        await supabase.from('config').upsert({ key: 'character_limit', value: newLimit });
        await message.reply(`✅ Character limit set to: ${newLimit}`);
      } else {
        await message.reply(`Usage: ${config.commandPrefix}characterset [amount]\nExample: ${config.commandPrefix}characterset 120`);
      }
      return;
    }
    
    if (command === 'limitset') {
      if (args.length === 2) {
        const newLimit = parseInt(args[1]);
        if (isNaN(newLimit) || newLimit < 100 || newLimit > 2000) {
          await message.reply('❌ Token limit must be a number between 100 and 2000.');
          return;
        }
        
        config.tokenLimit = newLimit;
        await supabase.from('config').upsert({ key: 'token_limit', value: newLimit });
        await message.reply(`✅ Daily token limit set to: ${newLimit}`);
      } else {
        await message.reply(`Usage: ${config.commandPrefix}limitset [amount]\nExample: ${config.commandPrefix}limitset 750`);
      }
      return;
    }
  }
  
  // Admin commands can be used in DMs or server
  if (command === 'commands') {
    // Reactivate bot if silenced or in maintenance
    config.botSilenced = false;
    config.maintenanceMode = false;
    await supabase.from('config').upsert({ key: 'bot_silenced', value: false });
    await supabase.from('config').upsert({ key: 'maintenance_mode', value: false });
    
    const commandsMsg = `**🤖 Available Admin Commands:**
  **DM Commands (Admin Only):**
- \`${config.commandPrefix}characterset [amount]\` - Set character limit (10-500)
- \`${config.commandPrefix}limitset [amount]\` - Set daily token limit (100-2000)

**Server Commands:**
- \`${config.commandPrefix}rank\` - View your rank (once per day, dedicated channels only)
- \`${config.commandPrefix}botinfo\` - Bot information (dedicated channels only)
- \`${config.commandPrefix}leaderboard\` - Top 10 users (admin only)

**General Admin Commands:**
- \`${config.commandPrefix}commands\` - Show this list
- \`${config.commandPrefix}status\` - Bot status
- \`${config.commandPrefix}stats\` - Bot statistics
- \`${config.commandPrefix}silence\` - Toggle bot silence
- \`${config.commandPrefix}maintenance\` - Toggle maintenance mode
- \`${config.commandPrefix}xp [on/off]\` - Toggle XP system
- \`${config.commandPrefix}allowall [on/off]\` - Toggle allow all users
- \`${config.commandPrefix}prefix [new_prefix]\` - Change command prefix
- \`${config.commandPrefix}warn [@user] [reason]\` - Warn a user
- \`${config.commandPrefix}warnings [@user]\` - Check user warnings
- \`${config.commandPrefix}purge [@user]\` - Delete user XP data

**Current Settings:**
- Token Limit: ${config.tokenLimit}
- Character Limit: ${config.characterLimit}
- XP System: ${config.xpEnabled ? 'Enabled' : 'Disabled'}
- Allow All: ${config.allowAll ? 'Yes' : 'No'}
- Bot Silenced: ${config.botSilenced ? 'Yes' : 'No'}
- Maintenance Mode: ${config.maintenanceMode ? 'Yes' : 'No'}
- Command Prefix: ${config.commandPrefix}`;
    
    await message.reply(commandsMsg);
    return;
  }
  
  if (command === 'status') {
    const ping = getBotPing();
    const uptime = getUptime();
    
    const statusMsg = `**🤖 Bot Status:**
• Status: ${config.maintenanceMode ? '🔧 Maintenance' : config.botSilenced ? '🔇 Silenced' : '🟢 Online'}
• Ping: ${ping}ms
• Uptime: ${uptime}
• Version: ${BOT_VERSION}
• XP System: ${config.xpEnabled ? '✅ Enabled' : '❌ Disabled'}
• Allow All Users: ${config.allowAll ? '✅ Yes' : '❌ No'}
• Token Limit: ${config.tokenLimit}
• Character Limit: ${config.characterLimit}
• Command Prefix: ${config.commandPrefix}`;
    
    await message.reply(statusMsg);
    return;
  }
  
  if (command === 'stats') {
    const xpStats = await getXPStats();
    
    if (!xpStats) {
      await message.reply('❌ Error fetching statistics.');
      return;
    }
    
    const statsMsg = `**📊 Bot Statistics:**
• Total Users: ${xpStats.totalUsers}
• Top User: ${xpStats.topUser ? `${xpStats.topUser.username} (Level ${xpStats.topUser.level})` : 'None'}
• Recent Messages: ~${xpStats.recentMessages}
• Uptime: ${getUptime()}
• Version: ${BOT_VERSION}`;
    
    await message.reply(statsMsg);
    return;
  }
  
  if (command === 'silence') {
    config.botSilenced = !config.botSilenced;
    await supabase.from('config').upsert({ key: 'bot_silenced', value: config.botSilenced });
    await message.reply(`🔇 Bot silence mode: ${config.botSilenced ? 'ON' : 'OFF'}`);
    return;
  }
  
  if (command === 'maintenance') {
    config.maintenanceMode = !config.maintenanceMode;
    await supabase.from('config').upsert({ key: 'maintenance_mode', value: config.maintenanceMode });
    await message.reply(`🔧 Maintenance mode: ${config.maintenanceMode ? 'ON' : 'OFF'}`);
    return;
  }
  
  if (command === 'xp') {
    if (args.length === 2) {
      const setting = args[1].toLowerCase();
      if (setting === 'on' || setting === 'off') {
        config.xpEnabled = setting === 'on';
        await supabase.from('config').upsert({ key: 'xp_enabled', value: config.xpEnabled });
        await message.reply(`✨ XP system: ${config.xpEnabled ? 'ENABLED' : 'DISABLED'}`);
      } else {
        await message.reply(`Usage: ${config.commandPrefix}xp [on/off]`);
      }
    } else {
      await message.reply(`Usage: ${config.commandPrefix}xp [on/off]`);
    }
    return;
  }
  
  if (command === 'allowall') {
    if (args.length === 2) {
      const setting = args[1].toLowerCase();
      if (setting === 'on' || setting === 'off') {
        config.allowAll = setting === 'on';
        await supabase.from('config').upsert({ key: 'allow_all', value: config.allowAll });
        await message.reply(`👥 Allow all users: ${config.allowAll ? 'ENABLED' : 'DISABLED'}`);
      } else {
        await message.reply(`Usage: ${config.commandPrefix}allowall [on/off]`);
      }
    } else {
      await message.reply(`Usage: ${config.commandPrefix}allowall [on/off]`);
    }
    return;
  }
  
  if (command === 'prefix') {
    if (args.length === 2) {
      const newPrefix = args[1];
      if (newPrefix.length > 3) {
        await message.reply('❌ Prefix must be 3 characters or less.');
        return;
      }
      
      config.commandPrefix = newPrefix;
      await supabase.from('config').upsert({ key: 'command_prefix', value: newPrefix });
      await message.reply(`✅ Command prefix changed to: ${newPrefix}`);
    } else {
      await message.reply(`Usage: ${config.commandPrefix}prefix [new_prefix]\nExample: ${config.commandPrefix}prefix !`);
    }
    return;
  }
  
  if (command === 'warn') {
    if (args.length < 3) {
      await message.reply(`Usage: ${config.commandPrefix}warn [@user] [reason]`);
      return;
    }
    
    const userMention = message.mentions.users.first();
    if (!userMention) {
      await message.reply('❌ Please mention a valid user.');
      return;
    }
    
    const reason = args.slice(2).join(' ');
    const success = await addWarning(userMention.id, reason, userId);
    
    if (success) {
      const warningCount = await getWarningCount(userMention.id);
      await message.reply(`⚠️ Warning added to ${userMention.username}.\nReason: ${reason}\nTotal warnings: ${warningCount}`);
    } else {
      await message.reply('❌ Error adding warning.');
    }
    return;
  }
  
  if (command === 'warnings') {
    if (args.length < 2) {
      await message.reply(`Usage: ${config.commandPrefix}warnings [@user]`);
      return;
    }
    
    const userMention = message.mentions.users.first();
    if (!userMention) {
      await message.reply('❌ Please mention a valid user.');
      return;
    }
    
    const warningCount = await getWarningCount(userMention.id);
    await message.reply(`⚠️ ${userMention.username} has ${warningCount} warning(s).`);
    return;
  }
  
  if (command === 'purge') {
    if (args.length < 2) {
      await message.reply(`Usage: ${config.commandPrefix}purge [@user]`);
      return;
    }
    
    const userMention = message.mentions.users.first();
    if (!userMention) {
      await message.reply('❌ Please mention a valid user.');
      return;
    }
    
    try {
      await purgeUserXP(userMention.id);
      await message.reply(`🗑️ XP data purged for ${userMention.username}.`);
    } catch (error) {
      await message.reply('❌ Error purging user data.');
    }
    return;
  }
}

// ==================== MESSAGE HANDLING ====================

// Bot ready event
client.once('ready', async () => {
  console.log(`${client.user.tag} is online!`);
  await loadConfig();
  
  // Set bot activity
  client.user.setActivity('DMS Content', { type: 'WATCHING' });
});

// Message create event
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  const userId = message.author.id;
  const isDM = message.channel.type === ChannelType.DM;
  const isInDedicatedChannel = config.allowedChannels.includes(message.channel.id);
  
  // Check for AFK mentions
  if (message.mentions.users.size > 0) {
    for (const [mentionedUserId, mentionedUser] of message.mentions.users) {
      const afkData = await getAFK(mentionedUserId);
      if (afkData) {
        const afkTime = new Date(afkData.timestamp);
        const timeDiff = Date.now() - afkTime.getTime();
        const hours = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        
        await message.reply(`${mentionedUser.username} is AFK: ${afkData.reason} (${hours}h ${minutes}m ago)`);
      }
    }
  }
  
  // Remove AFK status if user sends a message
  const userAFK = await getAFK(userId);
  if (userAFK) {
    await removeAFK(userId);
    await message.reply(`Welcome back ${message.author.username}! Your AFK status has been removed.`);
  }
  
  // Award XP for messages (only in dedicated channels or DMs)
  if (config.xpEnabled && (isInDedicatedChannel || isDM)) {
    await awardXP(userId, message.author.username);
  }
  
  // Handle commands
  if (message.content.startsWith(config.commandPrefix)) {
    await processCommand(message);
    return;
  }
  
  // Handle AFK command without prefix
  if (message.content.toLowerCase().startsWith('afk ')) {
    const reason = message.content.slice(4).trim() || 'No reason provided';
    const success = await setAFK(userId, reason);
    
    if (success) {
      await message.reply(`${message.author.username}, you are now AFK: ${reason}`);
    } else {
      await message.reply('❌ Error setting AFK status.');
    }
    return;
  }
  
  // Skip bot response if silenced or in maintenance
  if (config.botSilenced || config.maintenanceMode) return;
  
  // Skip if bot is not enabled
  if (!config.botEnabled) return;
  
  // Check if message should trigger bot response
  const shouldRespond = (
    isDM || // Always respond in DMs
    (isInDedicatedChannel && (config.allowAll || isWhitelisted(userId))) || // Respond in dedicated channels only if allowed
    (!isDM && !isInDedicatedChannel && isWhitelisted(userId) && config.allowAll) // Respond to whitelisted users outside dedicated channels only if allowAll is enabled
  );
  
  if (!shouldRespond) return;
  
  // Check if message mentions the bot
  const botMentioned = message.mentions.has(client.user) || 
                      message.content.toLowerCase().includes('dms') ||
                      message.content.toLowerCase().includes('bot');
  
  // Only respond if in DMs, dedicated channels, or if bot is mentioned and user is allowed
  if (!isDM && !isInDedicatedChannel) return;
  
  // Check token limit (skip for whitelisted users)
  if (!isWhitelisted(userId)) {
    const tokensUsed = await checkTokenUsage(userId);
    
    if (tokensUsed >= config.tokenLimit) {
      await message.reply('❌ You have reached your daily token limit. Try again tomorrow!');
      return;
    }
  }
  
  try {
    await withTypingIndicator(message.channel, async () => {
      const response = await generateResponse(message.content, userId);
      
      if (response.text) {
        await message.reply(response.text);
      }
    });
  } catch (error) {
    console.error('Error processing message:', error);
    await message.reply('❌ Sorry, I encountered an error processing your message.');
  }
});

// Express routes
app.get('/', (req, res) => {
  res.send('DMS Discord Bot is running!');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: getUptime(),
    version: BOT_VERSION,
    ping: getBotPing()
  });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);

// Handle process termination
process.on('SIGINT', () => {
  console.log('Received SIGINT. Graceful shutdown...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Graceful shutdown...');
  client.destroy();
  process.exit(0);
});
