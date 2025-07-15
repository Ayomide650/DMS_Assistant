const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Discord Bot Server is running!',
        status: 'online',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Health endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Keep alive function
function keepAlive() {
    const server = app.listen(PORT, () => {
        console.log(`🌐 Web server running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Self-ping every 14 minutes to prevent Render from sleeping the service
    const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes in milliseconds

    setInterval(async () => {
        try {
            // Get your Render app URL from environment or construct it
            const appUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
            const response = await axios.get(`${appUrl}/health`, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Discord-Bot-KeepAlive/1.0'
                }
            });

            if (response.status === 200) {
                console.log(`✅ Self-ping successful: ${response.status} at ${new Date().toISOString()}`);
            } else {
                console.log(`⚠️ Self-ping returned: ${response.status}`);
            }
        } catch (error) {
            console.log(`❌ Self-ping failed: ${error.message}`);
        }
    }, PING_INTERVAL);

    console.log(`🔄 Self-ping scheduled every ${PING_INTERVAL / 60000} minutes`);

    return server;
}

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

module.exports = { app, keepAlive };
