const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

class BotManager {
    constructor() {
        this.activeBots = new Map(); // sessionId -> bot process
        this.baseBotDir = path.join(__dirname, 'gifted-bot-instances');
        this.ensureDirectory(this.baseBotDir);
    }

    ensureDirectory(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    async createBotInstance(sessionId, sessionData) {
        const botInstanceId = uuidv4().substring(0, 8);
        const instanceDir = path.join(this.baseBotDir, botInstanceId);
        
        // Create instance directory structure
        this.ensureDirectory(instanceDir);
        this.ensureDirectory(path.join(instanceDir, 'gift'));
        this.ensureDirectory(path.join(instanceDir, 'gift', 'session'));
        this.ensureDirectory(path.join(instanceDir, 'gift', 'temp'));
        this.ensureDirectory(path.join(instanceDir, 'gifted'));

        // 1. Copy bot core files
        await this.copyBotFiles(sessionId, instanceDir, sessionData);
        
        // 2. Create instance-specific config
        await this.createInstanceConfig(instanceDir, sessionId);
        
        // 3. Start bot process
        return await this.startBotProcess(botInstanceId, instanceDir, sessionId);
    }

    async copyBotFiles(sessionId, instanceDir, sessionData) {
        // Write session data
        const sessionPath = path.join(instanceDir, 'gift', 'session', 'creds.json');
        fs.writeFileSync(sessionPath, sessionData);

        // Copy essential bot files from current directory
        const sourceDir = __dirname;
        const filesToCopy = [
            'gift.js', 'config.js', 'gmdFunctions.js', 'gmdFunctions3.js',
            'gmdCmds.js', 'gmdHelpers.js'
        ];

        for (const file of filesToCopy) {
            const source = path.join(sourceDir, file);
            const dest = path.join(instanceDir, file);
            if (fs.existsSync(source)) {
                fs.copyFileSync(source, dest);
            }
        }

        // Copy the main bot file
        const mainBotSource = path.join(sourceDir, 'index.js');
        const mainBotDest = path.join(instanceDir, 'index.js');
        if (fs.existsSync(mainBotSource)) {
            const content = fs.readFileSync(mainBotSource, 'utf8');
            // Modify to run as standalone instance
            const modifiedContent = content.replace(
                /const sessionDir = path\.join\(__dirname, "gift", "session"\);/,
                `const sessionDir = path.join(__dirname, "gift", "session");\nconsole.log("🤖 Bot Instance ID: ${sessionId.substring(0, 8)}");`
            );
            fs.writeFileSync(mainBotDest, modifiedContent);
        }

        // Copy gifted commands folder
        const giftedSource = path.join(sourceDir, 'gifted');
        const giftedDest = path.join(instanceDir, 'gifted');
        if (fs.existsSync(giftedSource)) {
            await this.copyDirectory(giftedSource, giftedDest);
        }
    }

    async copyDirectory(src, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        
        const entries = fs.readdirSync(src, { withFileTypes: true });
        
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            
            if (entry.isDirectory()) {
                await this.copyDirectory(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    async createInstanceConfig(instanceDir, sessionId) {
        // Create a modified config for this instance
        const configTemplate = {
            SESSION_ID: `Gifted~${sessionId}`,
            PREFIX: '!',
            BOT_NAME: 'Gifted-MD Bot',
            BOT_PIC: 'https://gitcdn.giftedtech.co.ke/image/AZO_image.jpg',
            FOOTER: 'Powered by Gifted Tech',
            OWNER_NUMBER: '254715206562',
            MODE: 'public',
            AUTO_READ: 'true',
            AUTO_REACT: 'true',
            AUTO_BIO: 'false',
            ANTILINK: 'false',
            ANTICALL: 'false',
            CHATBOT: 'false',
            BOT_REPO: 'https://github.com/mauricegift/gifted-md',
            NEWSLETTER_URL: 'https://whatsapp.com/channel/0029Vb3hlgX5kg7G0nFggl0Y',
            NEWSLETTER_JID: '120363178394853301@g.us',
            GiftedTechApi: 'https://api.giftedtech.co.ke',
            GiftedApiKey: 'gifted-tech'
        };

        const configPath = path.join(instanceDir, 'config.js');
        const configContent = `module.exports = ${JSON.stringify(configTemplate, null, 2)};`;
        fs.writeFileSync(configPath, configContent);
    }

    async startBotProcess(botInstanceId, instanceDir, originalSessionId) {
        return new Promise((resolve, reject) => {
            try {
                // Create package.json for this instance
                const packageJson = {
                    name: `gifted-bot-${botInstanceId}`,
                    main: "index.js",
                    dependencies: {
                        "@whiskeysockets/baileys": "npm:baileys@6.7.21",
                        "gifted-baileys": "*",
                        "gifted-btns": "*",
                        "axios": "^1.6.0",
                        "fs-extra": "^11.2.0",
                        "fluent-ffmpeg": "^2.1.2",
                        "ffmpeg-static": "^5.2.0",
                        "sharp": "^0.33.2",
                        "cheerio": "^1.0.0",
                        "pino": "^8.16.2",
                        "wa-sticker-formatter": "^4.3.2",
                        "google-tts-api": "^2.0.2",
                        "zlib": "^1.0.5"
                    }
                };

                fs.writeFileSync(
                    path.join(instanceDir, 'package.json'),
                    JSON.stringify(packageJson, null, 2)
                );

                // Create a simple launcher script
                const launcherScript = `
console.log("🚀 Starting Gifted-MD Bot Instance: ${botInstanceId}");
console.log("📁 Instance Directory: ${instanceDir}");
console.log("⏱ Start Time: ${new Date().toISOString()}");

// Set environment variables
process.env.BOT_INSTANCE_ID = "${botInstanceId}";
process.env.ORIGINAL_SESSION_ID = "${originalSessionId}";

// Start the bot
require('./index.js');

console.log("✅ Bot instance ${botInstanceId} started successfully!");
`;

                fs.writeFileSync(
                    path.join(instanceDir, 'launcher.js'),
                    launcherScript
                );

                // Start the bot process
                const botProcess = spawn('node', ['launcher.js'], {
                    cwd: instanceDir,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: {
                        ...process.env,
                        BOT_INSTANCE_ID: botInstanceId,
                        ORIGINAL_SESSION_ID: originalSessionId,
                        NODE_ENV: 'production'
                    },
                    detached: true
                });

                // Store process reference
                this.activeBots.set(originalSessionId, {
                    process: botProcess,
                    instanceId: botInstanceId,
                    instanceDir: instanceDir,
                    startTime: Date.now()
                });

                // Handle process output
                botProcess.stdout.on('data', (data) => {
                    const output = data.toString().trim();
                    if (output) {
                        console.log(`[Bot ${botInstanceId}] ${output}`);
                    }
                });

                botProcess.stderr.on('data', (data) => {
                    const error = data.toString().trim();
                    if (error && !error.includes('ExperimentalWarning')) {
                        console.error(`[Bot ${botInstanceId} ERROR] ${error}`);
                    }
                });

                botProcess.on('close', (code) => {
                    console.log(`[Bot ${botInstanceId}] Process exited with code ${code}`);
                    this.cleanupBot(originalSessionId);
                });

                botProcess.on('error', (err) => {
                    console.error(`[Bot ${botInstanceId}] Process error:`, err);
                    this.cleanupBot(originalSessionId);
                });

                // Detach process to run independently
                botProcess.unref();

                // Wait a moment to ensure process starts
                setTimeout(() => {
                    resolve({
                        success: true,
                        botInstanceId: botInstanceId,
                        processId: botProcess.pid,
                        instanceDir: instanceDir
                    });
                }, 2000);

            } catch (error) {
                console.error('Bot process start error:', error);
                reject(error);
            }
        });
    }

    cleanupBot(sessionId) {
        const botInfo = this.activeBots.get(sessionId);
        if (botInfo) {
            try {
                // Kill process if still running
                if (botInfo.process && !botInfo.process.killed) {
                    botInfo.process.kill('SIGTERM');
                }

                // Schedule directory cleanup after 10 minutes
                setTimeout(() => {
                    try {
                        if (fs.existsSync(botInfo.instanceDir)) {
                            fs.rmSync(botInfo.instanceDir, { recursive: true, force: true });
                            console.log(`🧹 Cleaned up bot instance: ${botInfo.instanceId}`);
                        }
                    } catch (cleanupError) {
                        console.error('Cleanup error:', cleanupError);
                    }
                }, 600000); // 10 minutes

                this.activeBots.delete(sessionId);
                console.log(`🗑️ Removed bot ${botInfo.instanceId} from active list`);
            } catch (error) {
                console.error('Cleanup error:', error);
            }
        }
    }

    getBotStatus(sessionId) {
        const botInfo = this.activeBots.get(sessionId);
        if (!botInfo) return { running: false };

        const uptime = Date.now() - botInfo.startTime;
        const uptimeStr = this.formatUptime(uptime);

        return {
            running: true,
            instanceId: botInfo.instanceId,
            pid: botInfo.process.pid,
            uptime: uptimeStr,
            instanceDir: botInfo.instanceDir,
            startTime: new Date(botInfo.startTime).toISOString()
        };
    }

    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    getAllBots() {
        const bots = [];
        for (const [sessionId, botInfo] of this.activeBots.entries()) {
            bots.push({
                sessionId: sessionId.substring(0, 8) + '...',
                instanceId: botInfo.instanceId,
                pid: botInfo.process.pid,
                uptime: Date.now() - botInfo.startTime,
                startTime: new Date(botInfo.startTime).toISOString()
            });
        }
        return bots;
    }

    stopBot(sessionId) {
        const botInfo = this.activeBots.get(sessionId);
        if (botInfo) {
            this.cleanupBot(sessionId);
            return { success: true, message: `Bot ${botInfo.instanceId} stopped` };
        }
        return { success: false, message: 'Bot not found' };
    }
}

module.exports = new BotManager();
