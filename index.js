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
const BOT_VERSION = '3.2';
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

// Function to truncate response to 90 character limit
function truncateResponse(text, maxLength = 90) {
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

You have comprehensive knowledge about current events, world news, science, technology, history, culture, entertainment, sports, and all general topics. Be helpful, friendly, and conversational. Keep responses very short and concise (under 90 characters).

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
    
    // Truncate response to fit Discord's limit
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
  
  // All other commands require admin privileges (except botinfo)
  if (!isAdmin(userId)) return;
  
  // Admin commands can be used in DMs or server
  if (command === 'commands') {
    // Reactivate bot if silenced or in maintenance
    config.botSilenced = false;
    config.maintenanceMode = false;
    await supabase.from('config').upsert({ key: 'bot_silenced', value: false });
    await supabase.from('config').upsert({ key: 'maintenance_mode', value: false });
    
    const commandsMsg = `**🤖 Available Admin Commands:**

**Bot Control:**
\`${config.commandPrefix}stop\` - Completely silence the bot
\`${config.commandPrefix}admin\` - Set bot to admin-only mode
\`${config.commandPrefix}all\` - Allow bot to respond to all users
\`${config.commandPrefix}status\` - Show current bot status and uptime
\`${config.commandPrefix}maintenance on|off\` - Enable/disable maintenance mode

**XP System:**
\`${config.commandPrefix}xp\` - Enable XP system
\`${config.commandPrefix}xpstop\` - Disable XP system
\`${config.commandPrefix}leaderboard\` - Show top 10 XP users
\`${config.commandPrefix}stats\` - Show XP system statistics
\`${config.commandPrefix}purge [user_id]\` - Delete user's XP data
\`${config.commandPrefix}whois [user_id]\` - Show user's XP info

**Moderation:**
\`${config.commandPrefix}warn [@user] [reason]\` - Issue warning to user
\`${config.commandPrefix}ban [@user]\` - Ban user from server
\`${config.commandPrefix}afk [reason]\` - Set AFK status with reason

**Channel Management:**
\`${config.commandPrefix}channel add [channel_id]\` - Add dedicated channel
\`${config.commandPrefix}channel remove [channel_id]\` - Remove dedicated channel
\`${config.commandPrefix}channel list\` - List all dedicated channels

**Configuration:**
\`${config.commandPrefix}setprefix [symbol]\` - Change command prefix

**Info:**
\`${config.commandPrefix}botinfo\` - Show bot info (Available to all in dedicated channels)
\`${config.commandPrefix}commands\` - Show this help message

*Note: All admin commands work in DMs and server, and reactivate the bot if silenced.*`;
    
    await message.reply(commandsMsg);
  }
  else if (command === 'maintenance') {
    if (args.length === 2) {
      const mode = args[1].toLowerCase();
      if (mode === 'on') {
        config.maintenanceMode = true;
        await supabase.from('config').upsert({ key: 'maintenance_mode', value: true });
        await message.reply('⚙️ Maintenance mode enabled. Bot will remain silent and respond with maintenance message when questioned.');
      } else if (mode === 'off') {
        config.maintenanceMode = false;
        await supabase.from('config').upsert({ key: 'maintenance_mode', value: false });
        await message.reply('✅ Maintenance mode disabled. Bot is now fully operational.');
      } else {
        await message.reply(`Usage: ${config.commandPrefix}maintenance on|off`);
      }
    } else {
      await message.reply(`Usage: ${config.commandPrefix}maintenance on|off`);
    }
  }
  else if (command === 'setprefix') {
    if (args.length === 2) {
      const newPrefix = args[1];
      if (newPrefix.length === 1) {
        config.commandPrefix = newPrefix;
        await supabase.from('config').upsert({ key: 'command_prefix', value: newPrefix });
        await message.reply(`✅ Command prefix changed to: \`${newPrefix}\``);
      } else {
        await message.reply('Prefix must be a single character.');
      }
    } else {
      await message.reply(`Usage: ${config.commandPrefix}setprefix [symbol]`);
    }
  }
  else if (command === 'afk') {
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const success = await setAFK(userId, reason);
    
    if (success) {
      await message.reply(`✅ AFK status set: ${reason}`);
    } else {
      await message.reply('❌ Failed to set AFK status.');
    }
  }
  else if (command === 'warn') {
    if (args.length >= 3 && message.mentions.users.size > 0) {
      const targetUser = message.mentions.users.first();
      const reason = args.slice(2).join(' ');
      
      const success = await addWarning(targetUser.id, reason, userId);
      const warningCount = await getWarningCount(targetUser.id);
      
      if (success) {
        await message.reply(`⚠️ Warning issued to <@${targetUser.id}>\n**Reason:** ${reason}\n**Total Warnings:** ${warningCount}`);
      } else {
        await message.reply('❌ Failed to issue warning.');
      }
    } else {
      await message.reply(`Usage: ${config.commandPrefix}warn [@user] [reason]`);
    }
  }
  else if (command === 'ban') {
    if (message.mentions.users.size > 0) {
      const targetUser = message.mentions.users.first();
      
      try {
        // Get guild member
        const member = await message.guild.members.fetch(targetUser.id);
        
        // Check if user can be banned
        if (!member.bannable) {
          await message.reply('❌ Cannot ban this user (insufficient permissions or user has higher role).');
          return;
        }
        
        // Ban the user
        await member.ban({ reason: `Banned by ${message.author.tag}` });
        await message.reply(`🔨 Successfully banned <@${targetUser.id}>`);
        
      } catch (error) {
        console.error('Error banning user:', error);
        await message.reply('❌ Failed to ban user. Make sure I have ban permissions and the user is in this server.');
      }
    } else {
      await message.reply(`Usage: ${config.commandPrefix}ban [@user]`);
    }
  }
  else if (command === 'stop') {
    config.botSilenced = true;
    config.maintenanceMode = false;
    await supabase.from('config').upsert({ key: 'bot_silenced', value: true });
    await supabase.from('config').upsert({ key: 'maintenance_mode', value: false });
    await message.reply('Bot is now completely silenced. Use any other command to reactivate.');
  }
  else if (command === 'status') {
    // Reactivate bot if silenced
    config.botSilenced = false;
    config.maintenanceMode = false;
    await supabase.from('config').upsert({ key: 'bot_silenced', value: false });
    await supabase.from('config').upsert({ key: 'maintenance_mode', value: false });
    
    const mode = config.allowAll ? 'All users' : 'Admin-only';
    const xpStatus = config.xpEnabled ? '✅ Enabled' : '❌ Disabled';
    const silenceStatus = config.botSilenced ? '✅ On' : '❌ Off';
    const maintenanceStatus = config.maintenanceMode ? '✅ On' : '❌ Off';
    const channelCount = config.allowedChannels.length;
    const uptime = getUptime();
    
    const statusMsg = `**🤖 Bot Status:**
    **Mode:** ${mode}
    **XP System:** ${xpStatus}
    **Silenced:** ${silenceStatus}
    **Maintenance:** ${maintenanceStatus}
    **Dedicated Channels:** ${channelCount}
    **Uptime:** ${uptime}
    **Ping:** ${getBotPing()}ms`;

await message.reply(statusMsg);
}
  else if (command === 'admin') {
    config.allowAll = false;
    config.botSilenced = false;
    config.maintenanceMode = false;
    await supabase.from('config').upsert({ key: 'allow_all', value: false });
    await supabase.from('config').upsert({ key: 'bot_silenced', value: false });
    await supabase.from('config').upsert({ key: 'maintenance_mode', value: false });
    await message.reply('Bot is now in admin-only mode.');
  }
  else if (command === 'all') {
    config.allowAll = true;
    config.botSilenced = false;
    config.maintenanceMode = false;
    await supabase.from('config').upsert({ key: 'allow_all', value: true });
    await supabase.from('config').upsert({ key: 'bot_silenced', value: false });
    await supabase.from('config').upsert({ key: 'maintenance_mode', value: false });
    await message.reply('Bot now responds to all users.');
  }
  else if (command === 'xp') {
    config.xpEnabled = true;
    config.botSilenced = false;
    config.maintenanceMode = false;
    await supabase.from('config').upsert({ key: 'xp_enabled', value: true });
    await supabase.from('config').upsert({ key: 'bot_silenced', value: false });
    await supabase.from('config').upsert({ key: 'maintenance_mode', value: false });
    await message.reply('XP system enabled!');
  }
  else if (command === 'xpstop') {
    config.xpEnabled = false;
    await supabase.from('config').upsert({ key: 'xp_enabled', value: false });
    await message.reply('XP system disabled.');
  }
  else if (command === 'leaderboard') {
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
  }
  else if (command === 'stats') {
    const stats = await getXPStats();
    const uptime = getUptime();
    
    if (!stats) {
      await message.reply('❌ Failed to fetch XP statistics.');
      return;
    }
    
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('📊 XP System Statistics')
      .addFields(
        { name: '👥 Total Users', value: stats.totalUsers.toString(), inline: true },
        { name: '💬 Recent Messages', value: stats.recentMessages.toString(), inline: true },
        { name: '⏱️ Bot Uptime', value: uptime, inline: true }
      )
      .setTimestamp();
    
    if (stats.topUser) {
      embed.addFields({
        name: '👑 Top User',
        value: `${stats.topUser.username}\nLevel ${stats.topUser.level} (${stats.topUser.rank}) - ${stats.topUser.xp.toLocaleString()} XP`,
        inline: false
      });
    }
    
    await message.reply({ embeds: [embed] });
  }
  else if (command === 'purge') {
    if (args.length === 2) {
      const targetUserId = args[1];
      
      try {
        await purgeUserXP(targetUserId);
        await message.reply(`✅ Successfully purged XP data for user ID: ${targetUserId}`);
      } catch (error) {
        await message.reply('❌ Failed to purge user XP data.');
      }
    } else {
      await message.reply(`Usage: ${config.commandPrefix}purge [user_id]`);
    }
  }
  else if (command === 'whois') {
    if (args.length === 2) {
      const targetUserId = args[1];
      
      try {
        const user = await getUserXP(targetUserId, 'Unknown');
        
        if (!user || user.xp === 0) {
          await message.reply('User not found in XP database.');
          return;
        }
        
        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('👤 User XP Information')
          .addFields(
            { name: 'Username', value: user.username, inline: true },
            { name: 'Level', value: user.level.toString(), inline: true },
            { name: 'Rank', value: user.rank, inline: true },
            { name: 'Total XP', value: user.xp.toLocaleString(), inline: true },
            { name: 'XP for Next Level', value: (totalXpForLevel(user.level + 1) - user.xp).toLocaleString(), inline: true },
            { name: 'Last Active', value: user.last_message_time ? `<t:${Math.floor(parseInt(user.last_message_time) / 1000)}:R>` : 'Never', inline: true }
          )
          .setTimestamp();
        
        await message.reply({ embeds: [embed] });
      } catch (error) {
        await message.reply('❌ Failed to fetch user information.');
      }
    } else {
      await message.reply(`Usage: ${config.commandPrefix}whois [user_id]`);
    }
  }
  else if (command === 'channel') {
    if (args.length >= 2) {
      const subCommand = args[1].toLowerCase();
      
      if (subCommand === 'add' && args.length === 3) {
        const channelId = args[2];
        
        if (!config.allowedChannels.includes(channelId)) {
          config.allowedChannels.push(channelId);
          
          await supabase.from('config').upsert({ 
            key: 'allowed_channels', 
            value: config.allowedChannels 
          });
          
          await message.reply(`✅ Channel <#${channelId}> added to dedicated channels.`);
        } else {
          await message.reply('Channel is already in the dedicated channels list.');
        }
      }
      else if (subCommand === 'remove' && args.length === 3) {
        const channelId = args[2];
        const index = config.allowedChannels.indexOf(channelId);
        
        if (index > -1) {
          config.allowedChannels.splice(index, 1);
          
          await supabase.from('config').upsert({ 
            key: 'allowed_channels', 
            value: config.allowedChannels 
          });
          
          await message.reply(`✅ Channel <#${channelId}> removed from dedicated channels.`);
        } else {
          await message.reply('Channel is not in the dedicated channels list.');
        }
      }
      else if (subCommand === 'list') {
        if (config.allowedChannels.length === 0) {
          await message.reply('No dedicated channels configured.');
        } else {
          const channelList = config.allowedChannels.map(id => `<#${id}>`).join('\n');
          await message.reply(`**Dedicated Channels:**\n${channelList}`);
        }
      }
      else {
        await message.reply(`Usage: ${config.commandPrefix}channel add|remove|list [channel_id]`);
      }
    } else {
      await message.reply(`Usage: ${config.commandPrefix}channel add|remove|list [channel_id]`);
    }
  }
}

// ==================== MESSAGE PROCESSING ====================

// Bot ready event
client.once('ready', async () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`);
  console.log(`Bot ID: ${client.user.id}`);
  console.log(`Servers: ${client.guilds.cache.size}`);
  
  // Load configuration from database
  await loadConfig();
  
  // Test database connection
  try {
    const { data, error } = await supabase.from('users').select('count').limit(1);
    if (error) {
      console.error('Database connection failed:', error);
    } else {
      console.log('Database connection successful');
    }
  } catch (error) {
    console.error('Database test failed:', error);
  }
});

// Message event handler
client.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  const userId = message.author.id;
  const username = message.author.username;
  const isDM = message.channel.type === ChannelType.DM;
  const isInDedicatedChannel = config.allowedChannels.includes(message.channel.id);
  
  // Check for AFK mentions in any channel (not just dedicated channels)
  if (message.mentions.users.size > 0 && !isDM) {
    for (const mentionedUser of message.mentions.users.values()) {
      if (isAdmin(mentionedUser.id)) {
        const afkData = await getAFK(mentionedUser.id);
        if (afkData) {
          await message.reply(`The user you have tagged is AFK: ${afkData.reason}`);
          break; // Only respond once per message
        }
      }
    }
  }
  
  // Process commands first (works in DMs and server for admins)
  if (message.content.startsWith(config.commandPrefix)) {
    await processCommand(message);
    return;
  }
  
  // Skip non-dedicated channels for regular bot responses
  if (!isDM && !isInDedicatedChannel) return;
  
  // Check if bot is silenced
  if (config.botSilenced) return;
  
  // Check maintenance mode
  if (config.maintenanceMode) {
    await message.reply('🔧 Bot is currently under maintenance. Please try again later.');
    return;
  }
  
  // Check permissions (admin-only vs all users)
  if (!config.allowAll && !isWhitelisted(userId)) return;
  
  // Award XP for messages in dedicated channels (not DMs)
  if (!isDM && config.xpEnabled) {
    await awardXP(userId, username);
  }
  
  // Check token usage for non-whitelisted users
  if (!isWhitelisted(userId)) {
    const tokensUsed = await checkTokenUsage(userId);
    if (tokensUsed >= config.tokenLimit) {
      await message.reply(`You've reached your daily token limit of ${config.tokenLimit}. Try again tomorrow!`);
      return;
    }
  }
  
  // Generate and send response
  try {
    await withTypingIndicator(message.channel, async () => {
      const response = await generateResponse(message.content, userId);
      await message.reply(response.text);
    });
  } catch (error) {
    console.error('Error processing message:', error);
    
    if (error.response && error.response.status === 429) {
      await message.reply('I\'m being rate limited. Please try again in a moment.');
    } else if (error.response && error.response.status === 401) {
      await message.reply('API authentication failed. Please contact an administrator.');
    } else {
      await message.reply('Sorry, I encountered an error while processing your message.');
    }
  }
});

// Handle member updates (for removing AFK when user becomes active)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const userId = message.author.id;
  
  // Remove AFK status when admin sends a message
  if (isAdmin(userId)) {
    const afkData = await getAFK(userId);
    if (afkData) {
      await removeAFK(userId);
      await message.reply(`Welcome back! Your AFK status has been removed. You were away for: ${afkData.reason}`);
    }
  }
});

// Error handling
client.on('error', (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Express server for health checks
app.get('/', (req, res) => {
  res.json({
    status: 'Bot is running',
    uptime: getUptime(),
    ping: getBotPing(),
    version: BOT_VERSION
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: getUptime()
  });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});

// Start Discord bot
client.login(process.env.DISCORD_TOKEN);
