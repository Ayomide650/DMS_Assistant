// ==================== MODULE IMPORTS ====================
require('dotenv').config();
const { keepAlive } = require('./server.js');
const express = require('express');
const {
    Client,
    GatewayIntentBits,
    Partials,
    ChannelType,
    EmbedBuilder,
    PermissionsBitField,
    Collection
} = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// ==================== INITIALIZATIONS ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
    ]
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.error("Supabase URL or Key is missing. Please check your .env file.");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// ==================== BOT CONFIGURATION ====================
const config = {
    botEnabled: true,
    allowedChannels: process.env.DEDICATED_CHANNELS ? process.env.DEDICATED_CHANNELS.split(',').map(id => id.trim()) : [],
    allowAll: false,
    tokenLimit: 500,
    maintenanceMode: false,
    commandPrefix: process.env.COMMAND_PREFIX || '!', // Default prefix, will be overwritten by DB if available
    xpEnabled: true,
    botSilenced: false,
    startTime: Date.now()
};

const XP_CONFIG = {
    xpPerMessage: 8,
    cooldownMs: 5000,
};

// ==================== BOT INFORMATION ====================
const BOT_VERSION = '3.7'; // Incremented version for changes
const BOT_DEVELOPERS = 'DMP Engineer, yilspain(.)';
const BOT_OWNER = 'justdms';
const BOT_INFO = { /* ... */ }; // Kept for brevity, defined in previous versions

const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
const WHITELIST_IDS = process.env.WHITELIST_IDS ? process.env.WHITELIST_IDS.split(',').map(id => id.trim()) : [];

// ==================== XP RANK DEFINITIONS ====================
const RANKS = [
    { name: 'Bronze', min: 1, max: 4 }, { name: 'Silver', min: 5, max: 9 },
    { name: 'Gold', min: 10, max: 14 }, { name: 'Platinum', min: 15, max: 19 },
    { name: 'Diamond', min: 20, max: 29 }, { name: 'Heroic', min: 30, max: 39 },
    { name: 'Elite Heroic', min: 40, max: 49 }, { name: 'Master', min: 50, max: 59 },
    { name: 'Elite Master', min: 60, max: 69 }, { name: 'Grandmaster 1', min: 70, max: 74 },
    { name: 'Grandmaster 2', min: 75, max: 79 }, { name: 'Grandmaster 3', min: 80, max: 84 },
    { name: 'Grandmaster 4', min: 85, max: 89 }, { name: 'Grandmaster 5', min: 90, max: 94 },
    { name: 'Grandmaster 6', min: 95, max: 100 }
];

// ==================== COMMAND DEFINITIONS (for Help Command) ====================
const commandsList = [
    { name: 'help', description: 'Shows this help message.', usage: 'help [command]', adminOnly: false },
    { name: 'ping', description: 'Checks the bot\'s latency.', adminOnly: false },
    { name: 'uptime', description: 'Shows how long the bot has been running.', adminOnly: false },
    { name: 'afk', description: 'Sets your AFK status.', usage: 'afk [reason]', adminOnly: false },
    { name: 'rank', description: 'Displays your or another user\'s rank card.', usage: 'rank [@user/userID]', adminOnly: false },
    { name: 'warnings', description: 'Shows your or another user\'s warnings.', usage: 'warnings [@user/userID]', adminOnly: false }, // Admin can see others
    { name: 'warn', description: 'Warns a user.', usage: 'warn <@user|userID> <reason>', adminOnly: true },
    { name: 'maintenance', description: 'Toggles maintenance mode.', adminOnly: true },
    { name: 'xp-toggle', description: 'Toggles the XP system.', adminOnly: true },
    { name: 'bot-silence', description: 'Toggles AI response silence mode.', adminOnly: true },
    { name: 'stats', description: 'Shows bot statistics.', adminOnly: true },
    { name: 'leaderboard', description: 'Shows the XP leaderboard.', adminOnly: true },
    { name: 'reset-tokens', description: 'Resets a user\'s daily AI token usage.', usage: 'reset-tokens <@user|userID>', adminOnly: true },
    { name: 'config', description: 'Views or updates bot configuration.', usage: 'config [key] [value]', adminOnly: true },
];


// ==================== HELPER FUNCTIONS ====================
// xpNeededForLevel, totalXpForLevel, getRankForLevel, isAdmin, isServerAdmin, isWhitelisted,
// withTypingIndicator, timeSince, timeUntil
// (These functions are unchanged from the previous full code provided, so they are omitted here for brevity.
//  Ensure they are present in your actual file.)

// Copied from previous full version for completeness in this snippet if needed elsewhere:
function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
}
async function withTypingIndicator(channel, callback) {
    try {
        await channel.sendTyping();
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 200)); 
        return await callback();
    } catch (error) {
        console.error('Error with typing indicator or callback:', error);
    }
}
function timeSince(date) {
    if (!date) return 'an unknown time ago';
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " year(s)";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " month(s)";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " day(s)";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hour(s)";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minute(s)";
    return Math.floor(seconds) + " second(s)";
}
function timeUntil(date) {
    if (!date) return "an unknown time";
    const seconds = Math.floor((new Date(date) - new Date()) / 1000);
    if (seconds <= 0) return "now";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    let timeString = '';
    if (hours > 0) timeString += `${hours}h `;
    if (minutes > 0) timeString += `${minutes}m `;
    if (hours === 0 && minutes === 0) timeString += `${secs}s`;
    return timeString.trim();
}
function getUptime() {
    const uptimeMs = Date.now() - config.startTime;
    const days = Math.floor(uptimeMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uptimeMs % (1000 * 60)) / 1000);
    let uptimeString = "";
    if (days > 0) uptimeString += `${days}d `;
    if (hours > 0) uptimeString += `${hours}h `;
    if (minutes > 0) uptimeString += `${minutes}m `;
    uptimeString += `${seconds}s`;
    return uptimeString.trim();
}
function totalXpForLevel(level) {
    if (level < 1) return 0;
    let totalXp = 0;
    for (let i = 1; i < level; i++) { 
        totalXp += xpNeededForLevel(i);
    }
    return totalXp;
}
function xpNeededForLevel(level) {
    return Math.round(0.9344 * Math.pow(level, 2) + 39.0656 * level - 0.9344 * level);
}
function getRankForLevel(level) {
    for (const rank of RANKS) {
        if (level >= rank.min && level <= rank.max) return rank.name;
    }
    return RANKS[RANKS.length - 1].name;
}


// ==================== SUPABASE & CORE LOGIC FUNCTIONS ====================
// setAFK, removeAFK, getAFK
// addWarning, getUserWarnings
// canUseRankCommand
// getUserXP, awardXP, getLeaderboard, purgeUserXP
// checkTokenUsage, updateTokenUsage
// getXPStats
// isSensitivityQuestion, generateResponse
// loadConfig, saveConfig
// (These functions are largely unchanged from the previous full code. Ensure they are present.)

// --- Config Management (Example - ensure this matches your needs) ---
async function loadConfig() {
    console.log("[CONFIG] Attempting to load configuration from database...");
    try {
        const { data, error } = await supabase.from('config').select('key, value');
        if (error) {
            console.error("[CONFIG] Supabase error fetching config:", error.message);
            throw error; // Rethrow to be caught by outer catch
        }

        if (data) {
            let dbConfigLoaded = false;
            data.forEach(item => {
                dbConfigLoaded = true;
                if (item.key in config) {
                    if (typeof config[item.key] === 'boolean') config[item.key] = (item.value === 'true' || item.value === true);
                    else if (typeof config[item.key] === 'number') config[item.key] = Number(item.value);
                    else if (Array.isArray(config[item.key])) {
                        try {
                            const parsedArray = JSON.parse(item.value); // Expects JSON array string
                            if(Array.isArray(parsedArray)) config[item.key] = parsedArray;
                        } catch (e) {
                            if (item.value && typeof item.value === 'string') config[item.key] = item.value.split(',').map(s => s.trim()); else config[item.key] = [];
                        }
                    }
                    else config[item.key] = item.value;
                } else {
                    console.warn(`[CONFIG] Key "${item.key}" from DB not found in default config object. Ignoring.`);
                }
            });
            if (!dbConfigLoaded && data.length === 0) console.log("[CONFIG] No configuration found in database. Using defaults/env.");
            else console.log("[CONFIG] Database configuration applied.");
        } else {
             console.log("[CONFIG] No data returned from config table. Using defaults/env.");
        }

        // Ensure essential configs like prefix have a fallback
        if (!config.commandPrefix) {
            console.warn("[CONFIG] Command prefix is empty after DB load, falling back to '!'");
            config.commandPrefix = '!';
        }

        const envChannels = process.env.DEDICATED_CHANNELS ? process.env.DEDICATED_CHANNELS.split(',').map(id => id.trim()) : [];
        const dbChannels = Array.isArray(config.allowedChannels) ? config.allowedChannels : [];
        config.allowedChannels = [...new Set([...envChannels, ...dbChannels])];

        console.log('[CONFIG] Final effective configuration:', config);
    } catch (error) {
        console.error('[CONFIG] Error loading config from database:', error.message);
        console.log('[CONFIG] Using default/env configuration due to error.');
        // Ensure prefix has a hard fallback if everything fails
        if (!config.commandPrefix) config.commandPrefix = '!';
    }
}

async function saveConfig(key, value) {
    try {
        const dbValue = Array.isArray(value) ? JSON.stringify(value) : String(value); // Ensure value is string or JSON string for DB
        const { error } = await supabase.from('config').upsert({ key, value: dbValue }, { onConflict: 'key' });
        if (error) throw error;
        console.log(`[CONFIG] Config saved to DB: ${key} = ${dbValue}`);
        return true;
    } catch (error) {
        console.error(`[CONFIG] Error saving config to DB (${key}):`, error);
        return false;
    }
}
// (Include other core logic functions: setAFK, addWarning, getUserXP, generateResponse, etc. here from previous version)
// For example, a minimal getUserXP for testing command flow:
async function getUserXP(userId, username) { /* ... from previous ... */ 
    try {
        let { data: user, error } = await supabase.from('user_xp').select('*').eq('user_id', userId).single();
        if (error && error.code === 'PGRST116') {
            const newUserRecord = { user_id: userId, username: username, xp: 0, level: 1, rank: getRankForLevel(1), last_message_time: '0', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            const { data: insertedUser, error: insertError } = await supabase.from('user_xp').insert(newUserRecord).select().single();
            if (insertError) throw insertError;
            return insertedUser;
        }
        if (error) throw error;
        if (user && user.username !== username) {
            const { data: updatedUser, error: updateError } = await supabase.from('user_xp').update({ username: username, updated_at: new Date().toISOString() }).eq('user_id', userId).select().single();
            if (updateError) console.error("Error updating username in XP table:", updateError); else user = updatedUser;
        }
        return user;
    } catch (error) { console.error('Error in getUserXP:', error); return null; }
}
async function awardXP(userId, username) { /* ... from previous ... */ 
    try {
        if (!config.xpEnabled || config.maintenanceMode) return;
        const user = await getUserXP(userId, username);
        if (!user) return;
        const now = Date.now();
        if (user.last_message_time && (now - parseInt(user.last_message_time)) < XP_CONFIG.cooldownMs) return;
        let newXp = user.xp + XP_CONFIG.xpPerMessage;
        let newLevel = user.level;
        while (newXp >= totalXpForLevel(newLevel + 1)) { newLevel++; }
        const newRank = getRankForLevel(newLevel);
        const { error: updateError } = await supabase.from('user_xp').update({ xp: newXp, level: newLevel, rank: newRank, last_message_time: now.toString(), updated_at: new Date().toISOString(), username: username }).eq('user_id', userId);
        if (updateError) throw updateError;
    } catch (error) { console.error('Error awarding XP:', error); }
}
async function getAFK(userId) { /* ... from previous ... */ 
    try {
        const { data, error } = await supabase.from('afk_users').select('*').eq('user_id', userId).single();
        if (error && error.code !== 'PGRST116') throw error; return data;
    } catch (error) { console.error('Error getting AFK status:', error); return null; }
}
async function removeAFK(userId) { /* ... from previous ... */ 
    try { const { error } = await supabase.from('afk_users').delete().eq('user_id', userId); if (error) throw error; return true; }
    catch (error) { console.error('Error removing AFK status:', error); return false; }
}
async function setAFK(userId, reason) { /* ... from previous ... */ 
    try { const { error } = await supabase.from('afk_users').upsert({ user_id: userId, reason: reason, timestamp: new Date().toISOString() }); if (error) throw error; return true; }
    catch (error) { console.error('Error setting AFK status:', error); return false; }
}
async function addWarning(userId, reason, adminId, messageLink = null) { /* ... from previous ... */ 
    try {
        const { data: warningData, error } = await supabase.from('user_warnings').insert({ user_id: userId, reason: reason, admin_id: adminId, message_link: messageLink, timestamp: new Date().toISOString() }).select();
        if (error) { console.error('Supabase error adding warning:', error); return false; }
        const warnLogsChannelId = process.env.WARN_LOGS_CHANNEL;
        if (warnLogsChannelId) { /* ... send to log channel ... */ }
        return true;
    } catch (error) { console.error('Critical error in addWarning function:', error); return false; }
}
async function getUserWarnings(userId) { /* ... from previous ... */ 
    try { const { data, error } = await supabase.from('user_warnings').select('*').eq('user_id', userId).order('timestamp', { ascending: false }); if (error) throw error; return data || []; }
    catch (error) { console.error('Error getting user warnings:', error); return []; }
}
async function canUseRankCommand(userId) { /* ... from previous ... */ 
    try {
        const { data, error } = await supabase.from('rank_usage').select('last_used').eq('user_id', userId).single();
        const now = new Date();
        if (error && error.code === 'PGRST116') { await supabase.from('rank_usage').insert({ user_id: userId, last_used: now.toISOString() }); return true; }
        if (error) throw error;
        const lastUsed = new Date(data.last_used);
        const timeDiffHours = (now - lastUsed) / (1000 * 60 * 60);
        if (timeDiffHours >= 24) { await supabase.from('rank_usage').update({ last_used: now.toISOString() }).eq('user_id', userId); return true; }
        return false;
    } catch (error) { console.error('Error checking rank usage:', error); return false; }
}
async function getLeaderboard(limit = 10) { /* ... from previous ... */ 
    try { const { data, error } = await supabase.from('user_xp').select('*').order('xp', { ascending: false }).limit(limit); if (error) throw error; return data || []; }
    catch (error) { console.error('Error fetching leaderboard:', error); return []; }
}
async function checkTokenUsage(userId) { /* ... from previous ... */ 
    try {
        let { data: user, error } = await supabase.from('users').select('tokens_used_today, last_reset').eq('id', userId).single();
        const today = new Date();
        if (error && error.code === 'PGRST116') { await supabase.from('users').insert({ id: userId, tokens_used_today: 0, last_reset: today.toISOString() }); return 0; }
        if (error) throw error;
        const lastReset = new Date(user.last_reset);
        if (lastReset.toDateString() !== today.toDateString()) { await supabase.from('users').update({ tokens_used_today: 0, last_reset: today.toISOString() }).eq('id', userId); return 0; }
        return user.tokens_used_today;
    } catch (error) { console.error('Error checking token usage:', error); return config.tokenLimit + 1; }
}
async function updateTokenUsage(userId, tokens) { /* ... from previous ... */ 
    try {
        const currentUsage = await checkTokenUsage(userId);
        const { error } = await supabase.from('users').update({ tokens_used_today: currentUsage + tokens }).eq('id', userId); if (error) throw error; return currentUsage + tokens;
    } catch (error) { console.error('Error updating token usage:', error); return config.tokenLimit + 1; }
}
async function getXPStats() { /* ... from previous ... */ 
    try {
        const { data: users, error, count } = await supabase.from('user_xp').select('*', { count: 'exact' }); if (error) throw error;
        const totalUsers = count || 0; const topUser = users && users.length > 0 ? users.sort((a, b) => b.xp - a.xp)[0] : null;
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000); const recentActiveUsers = users?.filter(user => user.last_message_time && parseInt(user.last_message_time) > oneDayAgo) || [];
        return { totalUsers, topUser, recentMessages: recentActiveUsers.length * 5 };
    } catch (error) { console.error('Error getting XP stats:', error); return null; }
}
function isSensitivityQuestion(messageContent) { /* ... from previous ... */ 
    const keywords = ['sensitivity', 'sens', 'dpi', 'aim', 'mouse settings', 'aim settings', 'config', 'setup', 'mouse config', 'best settings'];
    return keywords.some(k => messageContent.toLowerCase().includes(k));
}
async function generateResponse(prompt, userId) { /* ... from previous ... */ 
    try {
        if (isSensitivityQuestion(prompt)) return { text: "For sensitivity settings, please state your device in the test channel. 🎮", tokensUsed: 0 };
        const systemPrompt = `You are ${client.user.username}, a friendly gaming companion for DMS.EXE Community. Be concise, natural, and direct. No third-person narration. User ID: ${userId}. Date: ${new Date().toLocaleDateString()}.`;
        const fullPrompt = `${systemPrompt}\n\nUser: ${prompt}\n${client.user.username}:`;
        const response = await axios.post('https://api.together.xyz/v1/completions',
            { model: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free', prompt: fullPrompt, max_tokens: 150, temperature: 0.75, top_p: 0.9, stop: ["</think>", "User:", "\n\n\n", `${client.user.username}:`, "Bot:", "Human:"], repetition_penalty: 1.1 },
            { headers: { 'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`, 'Content-Type': 'application/json' } }
        );
        let text = response.data.choices[0].text.trim().replace(/<think>.*?<\/think>/gs, '').replace(/^Bot: /i, '').replace(/^.*?You reply:/i, '').split('\n\n')[0];
        if (!text || text.toLowerCase().includes('as an ai language model')) text = ["Hmm, not sure about that one!", "Interesting point!", "Gotcha."][Math.floor(Math.random() * 3)];
        return { text: text, tokensUsed: response.data.usage?.total_tokens || 0 };
    } catch (error) { console.error('Error generating AI response:', error.response?.data || error.message); return { text: "Oops! My circuits are a bit tangled. Try rephrasing or ask again later?", tokensUsed: 0 }; }
}


// ==================== DISCORD EVENT HANDLERS ====================
client.once('ready', async () => {
    console.log('------------------------------------------------------');
    console.log(`[READY] Bot is ready! Logged in as ${client.user.tag} (${client.user.id})`);
    config.startTime = Date.now();
    await loadConfig(); // Crucial: Load config which includes commandPrefix
    console.log(`[READY] Effective Command Prefix: "${config.commandPrefix}"`);
    console.log(`[READY] Servers: ${client.guilds.cache.size}`);
    console.log(`[READY] Admin IDs: ${ADMIN_IDS.join(', ')}`);
    console.log('------------------------------------------------------');

    // ADD THIS LINE:
    keepAlive(); // Start the web server for keep-alive functionality

    client.user.setActivity(`DM for help | ${config.commandPrefix}help`, { type: GatewayIntentBits.Watching });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Debug: Log received message and current prefix
    // console.log(`[MSG] Received: "${message.content}" from ${message.author.tag}. Effective prefix: "${config.commandPrefix}"`);

    if (config.maintenanceMode && !isAdmin(message.author.id)) {
        // if (message.content.startsWith(config.commandPrefix)) {
        //     // await message.reply("🛠️ Bot under maintenance.").catch(console.error);
        // }
        return;
    }

    const userId = message.author.id;
    const userTag = message.author.tag;

    // AFK & XP for non-commands (largely unchanged, ensure it's here)
    if (!message.content.startsWith(config.commandPrefix)) {
        const userAfkStatus = await getAFK(userId);
        if (userAfkStatus) {
            await removeAFK(userId);
            await message.reply(`👋 Welcome back, ${message.author.username}! AFK status removed.`).catch(console.error);
        }
        if (message.guild && config.xpEnabled && (config.allowAll || config.allowedChannels.includes(message.channel.id))) {
            await awardXP(userId, userTag);
        }
    }
     if (message.guild && message.mentions.users.size > 0) {
        for (const [, mentionedUser] of message.mentions.users) {
            if (mentionedUser.id === client.user.id || mentionedUser.id === userId) continue; 
            const afkData = await getAFK(mentionedUser.id);
            if (afkData) {
                const afkEmbed = new EmbedBuilder().setColor(0xFFA500)
                    .setDescription(`**${mentionedUser.username}** is AFK: ${afkData.reason} (for ${timeSince(afkData.timestamp)})`);
                await message.channel.send({ embeds: [afkEmbed] }).catch(console.error);
            }
        }
    }


    // Command Handling
    if (config.commandPrefix && message.content.startsWith(config.commandPrefix)) {
        const args = message.content.slice(config.commandPrefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        console.log(`[CMD] User ${userTag} (${userId}) attempted command: "${commandName}" with args: [${args.join(', ')}]`);

        // HELP COMMAND
        if (commandName === 'help') {
            const helpEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`${client.user.username} Help Desk`)
                .setDescription(`My prefix is \`${config.commandPrefix}\`. Here are my available commands:`)
                .setTimestamp()
                .setFooter({ text: `Requested by ${userTag}`});

            const userCommands = commandsList.filter(cmd => !cmd.adminOnly);
            const adminCommands = commandsList.filter(cmd => cmd.adminOnly);

            if (args.length === 0) { // General help
                helpEmbed.addFields({ name: '👤 User Commands', value: userCommands.map(cmd => `\`${config.commandPrefix}${cmd.name}${cmd.usage ? ' ' + cmd.usage : ''}\` - ${cmd.description}`).join('\n') });
                if (isAdmin(userId) && adminCommands.length > 0) {
                    helpEmbed.addFields({ name: '👑 Admin Commands', value: adminCommands.map(cmd => `\`${config.commandPrefix}${cmd.name}${cmd.usage ? ' ' + cmd.usage : ''}\` - ${cmd.description}`).join('\n') });
                }
                helpEmbed.addFields({name: 'ℹ️ More Info', value: `Type \`${config.commandPrefix}help <command_name>\` for more details on a specific command.`})

            } else { // Specific command help
                const specificCommandName = args[0].toLowerCase();
                const cmdInfo = commandsList.find(cmd => cmd.name === specificCommandName);

                if (cmdInfo && (!cmdInfo.adminOnly || isAdmin(userId))) {
                    helpEmbed.setTitle(`Command Details: \`${config.commandPrefix}${cmdInfo.name}\``);
                    helpEmbed.setDescription(cmdInfo.description);
                    if (cmdInfo.usage) {
                         helpEmbed.addFields({name: 'Usage', value: `\`${config.commandPrefix}${cmdInfo.name} ${cmdInfo.usage}\``});
                    } else {
                         helpEmbed.addFields({name: 'Usage', value: `\`${config.commandPrefix}${cmdInfo.name}\``});
                    }
                    if (cmdInfo.adminOnly) {
                        helpEmbed.addFields({name: 'Permission', value: 'Admin Only'});
                    }
                } else {
                    helpEmbed.setDescription(`Command \`${specificCommandName}\` not found or you don't have permission to view its details.`);
                }
            }
            return message.reply({ embeds: [helpEmbed] }).catch(console.error);
        }


        // --- Standard User Commands --- (Example: ping)
        if (commandName === 'ping') {
            const sent = await message.reply({ content: 'Pinging...', fetchReply: true });
            const latency = sent.createdTimestamp - message.createdTimestamp;
            const apiLatency = Math.round(client.ws.ping);
            const embed = new EmbedBuilder()
                .setColor(0x0099FF).setTitle('🏓 Pong!')
                .addFields({ name: 'Roundtrip Latency', value: `${latency}ms` }, { name: 'API Latency', value: `${apiLatency}ms` });
            return sent.edit({ content: null, embeds: [embed] }).catch(console.error);
        }
        if (commandName === 'uptime') { /* ... from previous ... */ 
             const embed = new EmbedBuilder().setColor(0x0099FF).setTitle('⏱️ Bot Uptime')
                .setDescription(`I've been running for **${getUptime()}**.\nStarted on: ${new Date(config.startTime).toLocaleString()}`);
            return message.reply({ embeds: [embed] }).catch(console.error);
        }
        if (commandName === 'afk') { /* ... from previous ... */ 
            const reason = args.join(' ') || 'No reason provided';
            if (reason.length > 100) return message.reply("❌ AFK reason cannot exceed 100 characters.").catch(console.error);
            const success = await setAFK(userId, reason);
            if (success) return message.reply(`✅ Your AFK status is set: ${reason}`).catch(console.error);
            return message.reply('❌ Failed to set AFK status.').catch(console.error);
        }
        if (commandName === 'rank') { /* ... from previous, ensure targetMember logic is sound ... */ 
            if (!config.xpEnabled) return message.reply("XP system is currently disabled.").catch(console.error);
            if (!message.guild) return message.reply("This command can only be used in a server.").catch(console.error);
            if (!isAdmin(userId)) {
                const canUse = await canUseRankCommand(userId);
                if (!canUse) { /* ... reply with cooldown ... */ 
                    const { data: usage } = await supabase.from('rank_usage').select('last_used').eq('user_id', userId).single();
                    const nextAvailable = new Date(new Date(usage.last_used).getTime() + 24 * 60 * 60 * 1000);
                    return message.reply(`❌ You can use this command again in about **${timeUntil(nextAvailable)}**.`).catch(console.error);
                }
            }
            const targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
            if (!targetMember) return message.reply("❌ Could not find that user.").catch(console.error);
            const userXPData = await getUserXP(targetMember.id, targetMember.user.tag);
            if (!userXPData) return message.reply(`❌ No XP data for ${targetMember.user.tag}.`).catch(console.error);
            // ... (rest of rank embed logic from previous version)
            const xpForCurrentLevel = totalXpForLevel(userXPData.level);
            const xpForNextLevel = totalXpForLevel(userXPData.level + 1);
            const progressXP = userXPData.xp - xpForCurrentLevel;
            const neededForLevelUp = xpForNextLevel - xpForCurrentLevel;
            const progressPercentage = neededForLevelUp > 0 ? Math.max(0, Math.min(100, Math.round((progressXP / neededForLevelUp) * 100))) : 100;
            const barLength = 10; const filledLength = Math.round(barLength * (progressPercentage / 100));
            const progressBar = '🟩'.repeat(filledLength) + '🟥'.repeat(barLength - filledLength);
            const rankEmbed = new EmbedBuilder().setColor(0x3498DB).setAuthor({ name: `${targetMember.user.tag}'s Rank Card`, iconURL: targetMember.user.displayAvatarURL() })
                .setThumbnail(targetMember.user.displayAvatarURL())
                .addFields(
                    { name: '🏆 Rank', value: userXPData.rank, inline: true }, { name: '🎖️ Level', value: userXPData.level.toString(), inline: true },
                    { name: '✨ Total XP', value: userXPData.xp.toString(), inline: true }, { name: '📊 Progress to Next Level', value: `${progressBar} (${progressPercentage}%)` },
                    { name: 'XP for Next', value: `${userXPData.xp} / ${xpForNextLevel}`, inline: true }, { name: 'Needed to Lvl Up', value: Math.max(0, xpForNextLevel - userXPData.xp).toString(), inline: true }
                ).setTimestamp();
            return message.reply({ embeds: [rankEmbed] }).catch(console.error);
        }
        if (commandName === 'warnings') { /* ... from previous ... */ 
            let targetUser = message.mentions.users.first() || await client.users.fetch(args[0]).catch(() => null);
             if (!targetUser) targetUser = message.author;
             else if (targetUser.id !== message.author.id && !isAdmin(userId)) return message.reply("❌ You can only view your own warnings unless admin.").catch(console.error);
             const warnings = await getUserWarnings(targetUser.id);
             if (!warnings.length) return message.reply(`✅ **${targetUser.tag}** has no warnings.`).catch(console.error);
             const embed = new EmbedBuilder().setColor(0xFFA500).setTitle(`📜 Warnings for ${targetUser.tag} (${warnings.length})`)
                 .setDescription(warnings.map((w, i) => `**${i + 1}.** By <@${w.admin_id}> on ${new Date(w.timestamp).toLocaleDateString()}\n Reason: \`${w.reason}\`${w.message_link ? `\n Context: [View](${w.message_link})` : ''}`).slice(0, 5).join('\n\n'))
                 .setFooter({ text: warnings.length > 5 ? `Showing 5 of ${warnings.length}.` : ''});
             return message.reply({ embeds: [embed] }).catch(console.error);
        }

        // --- Admin Only Commands ---
        const requestedAdminCommand = commandsList.find(cmd => cmd.name === commandName && cmd.adminOnly);
        if (requestedAdminCommand) {
            if (!isAdmin(userId)) {
                return message.reply("❌ You don't have permission to use this admin command.").catch(console.error);
            }
            // Fall through to specific admin command handlers
        }

        if (isAdmin(userId)) {
            if (commandName === 'warn') { /* ... from previous ... */ 
                const targetUser = message.mentions.users.first() || await client.users.fetch(args[0]).catch(() => null);
                const reason = targetUser ? args.slice(1).join(' ') : args.join(' ');
                if (!targetUser || !reason) return message.reply(`❌ Usage: \`${config.commandPrefix}warn <@user|userID> <reason>\``).catch(console.error);
                // ... (rest of warn logic)
                let messageLink = null; if (message.reference && message.reference.messageId && message.guild) messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.reference.messageId}`;
                const success = await addWarning(targetUser.id, reason, userId, messageLink);
                if (success) { await message.reply(`✅ **${targetUser.tag}** warned. Reason: ${reason}`).catch(console.error); /* ... DM user ... */ }
                else { await message.reply('❌ Failed to issue warning.').catch(console.error); } return;
            }
            if (commandName === 'maintenance') { /* ... from previous ... */ 
                config.maintenanceMode = !config.maintenanceMode; await saveConfig('maintenanceMode', config.maintenanceMode);
                return message.reply(`✅ Maintenance mode **${config.maintenanceMode ? 'ON' : 'OFF'}**.`).catch(console.error);
            }
            if (commandName === 'xp-toggle') { /* ... from previous ... */ 
                config.xpEnabled = !config.xpEnabled; await saveConfig('xpEnabled', config.xpEnabled);
                return message.reply(`✅ XP system **${config.xpEnabled ? 'ON' : 'OFF'}**.`).catch(console.error);
            }
            if (commandName === 'bot-silence') { /* ... from previous ... */ 
                config.botSilenced = !config.botSilenced; await saveConfig('botSilenced', config.botSilenced);
                return message.reply(`✅ Bot AI **${config.botSilenced ? 'SILENCED' : 'ACTIVE'}**.`).catch(console.error);
            }
            if (commandName === 'stats') { /* ... from previous, ensure xpStats is handled if null ... */ 
                const xpStats = await getXPStats(); const embed = new EmbedBuilder().setColor(0x0099FF).setTitle('📊 Bot Statistics')
                .addFields( { name: '📈 XP Users', value: xpStats?.totalUsers?.toString() || 'N/A', inline: true }, /* ... other fields ... */)
                .setTimestamp().setFooter({text: `Bot ID: ${client.user.id}`});
                return message.reply({ embeds: [embed] }).catch(console.error);
            }
            if (commandName === 'leaderboard') { /* ... from previous ... */ 
                const leaders = await getLeaderboard(10); if (!leaders.length) return message.reply('❌ No leaderboard data.').catch(console.error);
                const embed = new EmbedBuilder().setColor(0xFFD700).setTitle('🏆 XP Leaderboard - Top 10')
                    .setDescription(leaders.map((u, i) => `**${i + 1}.** <@${u.user_id}> - Lvl **${u.level}** (${u.xp} XP)`).join('\n'));
                return message.reply({ embeds: [embed] }).catch(console.error);
            }
            if (commandName === 'reset-tokens') { /* ... from previous ... */ 
                const targetUser = message.mentions.users.first() || await client.users.fetch(args[0]?.replace(/[<@!>]/g, '')).catch(() => null);
                if (!targetUser) return message.reply('❌ User not found.').catch(console.error);
                // ... (supabase update logic)
                const { error } = await supabase.from('users').update({ tokens_used_today: 0, last_reset: new Date().toISOString() }).eq('id', targetUser.id);
                if (error) return message.reply(`❌ Failed to reset tokens for ${targetUser.tag}.`).catch(console.error);
                return message.reply(`✅ AI Tokens reset for ${targetUser.tag}.`).catch(console.error);
            }
            if (commandName === 'config') { /* ... from previous, ensure saveConfig gets correct value types ... */ 
                // ... (full config logic from previous)
                const key = args[0]?.toLowerCase(); const valueStr = args.slice(1).join(' '); let valueToSet;
                if (!key) { /* ... show current config embed ... */ return; }
                // ... (switch case for different keys, ensuring values are correctly typed for saveConfig and config object)
                // Example for prefix:
                if (key === 'prefix') { if (valueStr.length > 0 && valueStr.length < 4) { config.commandPrefix = valueStr; await saveConfig('commandPrefix', valueStr); /* reply success */ } else { /* reply error */ }}
                // ... (other config keys)
                return; // Ensure this command ends if a key was processed
            }
        }
        // If commandName is not recognized after all checks:
        // console.log(`[CMD] Command "${commandName}" not found or permission denied.`);
        // Optionally, you can add a "command not found" message, but it can be noisy.
        // A silent fail for unknown commands is common.

    } else if (config.botEnabled && !config.maintenanceMode) {
        // AI Response Logic (non-command messages - largely unchanged, ensure it's here)
        const isDM = message.channel.type === ChannelType.DM;
        const isMentioned = message.mentions.has(client.user.id);
        const isAllowedChannel = message.guild && (config.allowAll || config.allowedChannels.includes(message.channel.id));

        if (isDM || isMentioned || (isAllowedChannel && !config.botSilenced)) {
             if (isDM && !ADMIN_IDS.includes(userId) && !WHITELIST_IDS.includes(userId) && process.env.DM_WHITELIST_ONLY === 'true') {
                 return message.reply("Sorry, DMs are restricted currently.").catch(console.error);
            }
            const tokensUsedToday = await checkTokenUsage(userId);
            if (!ADMIN_IDS.includes(userId) && !WHITELIST_IDS.includes(userId) && tokensUsedToday >= config.tokenLimit) {
                return message.reply(`Daily AI interaction limit (${config.tokenLimit} tokens) reached. Try tomorrow!`).catch(console.error);
            }
            // ... (rest of AI response logic from previous version)
            let userPrompt = message.content;
            if (isMentioned && message.guild) userPrompt = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
            if (!userPrompt && (isMentioned || isDM)) { /* handle empty mention/DM if needed */ return; }
            if (userPrompt.length < 3 && message.guild && !isMentioned) return;

            await withTypingIndicator(message.channel, async () => {
                const aiResponse = await generateResponse(userPrompt, userId);
                if (aiResponse && aiResponse.text) {
                    if (!ADMIN_IDS.includes(userId) && !WHITELIST_IDS.includes(userId)) await updateTokenUsage(userId, aiResponse.tokensUsed || 1);
                    await message.reply(aiResponse.text.substring(0, 1990)).catch(console.error);
                }
            });
        } else if (isAllowedChannel && config.botSilenced && isMentioned) {
            await message.reply("Shhh, I'm in silent mode. Admins can wake me up if needed!").catch(console.error);
        }
    }
});

// ==================== EXPRESS SERVER & BOT LOGIN ====================
// (Unchanged from previous full code: app.get, app.listen, client.login, process handlers
client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log("[LOGIN] Successfully logged into Discord."))
    .catch(error => { console.error("[LOGIN_CRITICAL] Failed to login:", error); process.exit(1); });

const shutdown = async (signal) => { console.log(`[SYSTEM] ${signal} received. Shutting down...`); if (client) await client.destroy(); console.log('[SYSTEM] Discord client destroyed.'); process.exit(0); };
process.on('SIGINT', () => shutdown('SIGINT')); process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', error => { console.error('[ERROR_UnhandledRejection]', error); });
process.on('uncaughtException', error => { console.error('[ERROR_UncaughtException]', error); shutdown('UncaughtException').then(() => process.exit(1)); });

console.log("[SYSTEM] Script execution finished. Attempting to connect bot...");
