const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, WebhookClient, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG_FILE = path.join(process.cwd(), 'database', 'channels.json');
const TOKEN = process.env.DISCORD_TOKEN; // Replace with your bot token
const CLIENT_ID = process.env.DISCORD_CLIENTID; // Replace with your bot's client ID

// Create a new client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Load or create channels.json file
function loadChannels() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(data);
        } else {
            // Create file with default structure if it doesn't exist
            const defaultData = { channels: [] };
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
    } catch (error) {
        console.error('Error loading channels file:', error);
    }
    // Return empty object if file doesn't exist or there's an error
    return { channels: [] };
}

// Save channels to file
function saveChannels(channelsData) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(channelsData, null, 2));
        console.log('Channels saved to file');
    } catch (error) {
        console.error('Error saving channels file:', error);
    }
}

// Command definitions
const commands = [
    new SlashCommandBuilder()
        .setName('here')
        .setDescription('Register this channel for message forwarding')
        .toJSON(),
    new SlashCommandBuilder()
        .setName('unhere')
        .setDescription('Unregister this channel from message forwarding')
        .toJSON()
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('Started refreshing application commands...');

        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands }
        );

        console.log('Successfully refreshed application commands!');
    } catch (error) {
        console.error('Error refreshing commands:', error);
    }
})();

// Bot event handlers
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, channelId, guildId, guild, channel } = interaction;

    if (commandName === 'here') {
        try {
            const channelsData = loadChannels();
            
            // Create a webhook for this channel
            const webhook = await channel.createWebhook({
                name: 'MessageForwarder',
                avatar: 'https://img.freepik.com/premium-vector/default-avatar-profile-icon-social-media-user-image-gray-avatar-icon-blank-profile-silhouette-vector-illustration_561158-3485.jpg', // Default avatar, can be changed
            });
            
            // Check if this channel is already registered
            const exists = channelsData.channels.some(ch => ch.channelId === channelId);
            
            if (!exists) {
                // Add new channel with webhook data
                channelsData.channels.push({
                    guildId: guildId,
                    guildName: guild.name,
                    channelId: channelId,
                    channelName: channel.name,
                    webhookId: webhook.id,
                    webhookToken: webhook.token,
                    webhookUrl: webhook.url,
                    registeredAt: new Date().toISOString()
                });
                
                saveChannels(channelsData);
                await interaction.reply({ content: '✅ This channel has been registered for message forwarding with custom profile support!', flags: [MessageFlags.Ephemeral] });
            } else {
                await interaction.reply({ content: '⚠️ This channel is already registered for message forwarding.', flags: [MessageFlags.Ephemeral] });
            }
        } catch (error) {
            console.error('Error handling /here command:', error);
            await interaction.reply({ content: '❌ An error occurred while registering this channel. Make sure the bot has "Manage Webhooks" permission.', flags: [MessageFlags.Ephemeral] });
        }
    } else if (commandName === 'unhere') {
        try {
            const channelsData = loadChannels();
            
            // Find this channel in our data
            const channelIndex = channelsData.channels.findIndex(ch => ch.channelId === channelId);
            
            if (channelIndex !== -1) {
                const channelInfo = channelsData.channels[channelIndex];
                
                // Try to delete the webhook if it exists
                if (channelInfo.webhookId) {
                    try {
                        // Try to get all webhooks for this channel
                        const webhooks = await channel.fetchWebhooks();
                        const botWebhook = webhooks.find(wh => wh.id === channelInfo.webhookId);
                        
                        // Delete the webhook if found
                        if (botWebhook) {
                            await botWebhook.delete('Channel unregistered from message forwarding');
                            console.log(`Deleted webhook for channel ${channelId}`);
                        }
                    } catch (webhookError) {
                        console.error(`Could not delete webhook for channel ${channelId}:`, webhookError);
                        // Continue with removal even if webhook deletion fails
                    }
                }
                
                // Remove the channel from our data
                channelsData.channels.splice(channelIndex, 1);
                saveChannels(channelsData);
                
                await interaction.reply({ 
                    content: '✅ This channel has been unregistered from message forwarding.',
                    flags: [MessageFlags.Ephemeral]
                });
            } else {
                await interaction.reply({ 
                    content: '⚠️ This channel was not registered for message forwarding.',
                    flags: [MessageFlags.Ephemeral]
                });
            }
        } catch (error) {
            console.error('Error handling /unhere command:', error);
            await interaction.reply({ 
                content: '❌ An error occurred while unregistering this channel.',
                flags: [MessageFlags.Ephemeral]
            });
        }
    }
});

// Message forwarding function with custom profile support
async function forwardMessage(content, options = {}) {
    try {
        const channelsData = loadChannels();
        const results = {
            success: [],
            failed: []
        };
        
        for (const channelInfo of channelsData.channels) {
            try {
                if (!channelInfo.webhookToken || !channelInfo.webhookId) {
                    results.failed.push({
                        channelId: channelInfo.channelId,
                        reason: 'No webhook information available'
                    });
                    continue;
                }
                
                // Create a webhook client
                const webhookClient = new WebhookClient({ 
                    id: channelInfo.webhookId, 
                    token: channelInfo.webhookToken 
                });
                
                // Prepare the webhook message options
                const messageOptions = {
                    content: content,
                    username: options.username || 'Message Forwarder',
                    avatarURL: options.avatarURL || 'https://img.freepik.com/premium-vector/default-avatar-profile-icon-social-media-user-image-gray-avatar-icon-blank-profile-silhouette-vector-illustration_561158-3485.jpg',
                };
                
                // Add files if provided
                if (options.files && options.files.length > 0) {
                    messageOptions.files = options.files;
                }
                
                // Send the message through the webhook
                await webhookClient.send(messageOptions);
                
                results.success.push({
                    channelId: channelInfo.channelId,
                    guildName: channelInfo.guildName,
                    channelName: channelInfo.channelName
                });
            } catch (error) {
                console.error(`Error sending to channel ${channelInfo.channelId}:`, error);
                results.failed.push({
                    channelId: channelInfo.channelId,
                    guildName: channelInfo.guildName,
                    channelName: channelInfo.channelName,
                    reason: error.message
                });
            }
        }
        
        return results;
    } catch (error) {
        console.error('Error forwarding message:', error);
        throw error;
    }
}

// Example of sending a media message with custom profile
async function sendMediaMessage(content, filePaths, username = null, avatarURL = null) {
    const files = filePaths.map(filePath => ({ attachment: filePath }));
    return await forwardMessage(content, { 
        files,
        username,
        avatarURL
    });
}

// Login to Discord
client.login(TOKEN);

// Export the functions for external use
module.exports = {
  forwardMessage,
  sendMediaMessage
};