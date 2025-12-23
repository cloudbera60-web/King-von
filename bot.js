import dotenv from 'dotenv';
dotenv.config();

import {
    makeWASocket,
    Browsers,
    fetchLatestBaileysVersion,
    DisconnectReason,
    useMultiFileAuthState,
    getContentType
} from '@whiskeysockets/baileys';
import { Handler, Callupdate, GroupUpdate } from './data/index.js';
import updateHandler from './plugins/update.js';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import NodeCache from 'node-cache';
import path from 'path';
import chalk from 'chalk';
import config from './config.cjs';
import pkg from './lib/autoreact.cjs';

const { emojis, doReact } = pkg;
const prefix = process.env.PREFIX || config.PREFIX;
const app = express();
let initialConnection = true;
const BOT_PORT = process.env.BOT_PORT || 3000;

const MAIN_LOGGER = pino({
    timestamp: () => `,"time":"${new Date().toJSON()}"`
});
const logger = MAIN_LOGGER.child({});
logger.level = "trace";

const msgRetryCounterCache = new NodeCache();
const sessionDir = path.join(process.cwd(), 'session');
const credsPath = path.join(sessionDir, 'creds.json');

// Ensure session directory exists
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

async function loadPlugins() {
    console.log(chalk.cyan("📦 Loading plugins..."));
    
    try {
        const pluginsDir = path.join(process.cwd(), 'plugins');
        
        if (!fs.existsSync(pluginsDir)) {
            console.warn(chalk.yellow("⚠️ Plugins directory not found!"));
            return [];
        }
        
        const pluginFiles = fs.readdirSync(pluginsDir).filter(file => 
            file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.mjs')
        );
        
        const loadedPlugins = [];
        
        for (const file of pluginFiles) {
            try {
                // Skip update.js if already imported
                if (file === 'update.js') continue;
                
                const pluginPath = path.join(pluginsDir, file);
                console.log(chalk.gray(`  → Loading: ${file}`));
                
                // Dynamic import for ES modules
                if (file.endsWith('.mjs') || file.endsWith('.js')) {
                    const plugin = await import(`file://${pluginPath}`);
                    loadedPlugins.push({ name: file, module: plugin });
                }
                // Require for CommonJS
                else if (file.endsWith('.cjs')) {
                    const plugin = require(pluginPath);
                    loadedPlugins.push({ name: file, module: plugin });
                }
            } catch (err) {
                console.error(chalk.red(`  ✗ Failed to load ${file}:`), err.message);
            }
        }
        
        console.log(chalk.green(`✅ Loaded ${loadedPlugins.length} plugins`));
        return loadedPlugins;
    } catch (error) {
        console.error(chalk.red("❌ Error loading plugins:"), error);
        return [];
    }
}

async function startBot() {
    if (!fs.existsSync(credsPath)) {
        console.log(chalk.yellow("⚠️ No session found. Please connect via QR/Pair first."));
        console.log(chalk.cyan(`🌐 Visit: http://localhost:50900 to connect`));
        return null;
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        
        console.log(chalk.blue(`📱 Using WA v${version.join('.')}, isLatest: ${isLatest}`));

        const Matrix = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: Browsers.macOS("Safari"),
            auth: state,
            getMessage: async (key) => {
                return { conversation: "Gifted-MD WhatsApp Bot" };
            }
        });

        Matrix.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log(chalk.yellow(`🔌 Connection closed. Reconnecting: ${shouldReconnect}`));
                
                if (shouldReconnect) {
                    setTimeout(() => startBot(), 5000);
                }
            } 
            else if (connection === 'open') {
                if (initialConnection) {
                    console.log(chalk.green("✅ Connected Successfully!"));
                    
                    // Load all plugins
                    const plugins = await loadPlugins();
                    
                    // Send connection success message
                    try {
                        await Matrix.sendMessage(Matrix.user.id, {
                            image: { url: "https://files.catbox.moe/52699c.jpg" },
                            caption: `╭─────────────━┈⊷
│ *CONNECTED SUCCESSFULLY *
╰─────────────━┈⊷

╭─────────────━┈⊷
│🤖 BOT NAME : Gifted-MD
│👨‍💻 DEV : GIFTED TECH
│📦 PLUGINS : ${plugins.length} loaded
╰─────────────━┈⊷

✅ Bot is now fully operational!
🚀 All features are ready to use.`
                        });
                    } catch (sendError) {
                        console.error("Failed to send welcome message:", sendError);
                    }
                    
                    initialConnection = false;
                } else {
                    console.log(chalk.blue("♻️ Connection reestablished."));
                }
            }
        });

        Matrix.ev.on('creds.update', saveCreds);
        
        // Message handler
        Matrix.ev.on("messages.upsert", async chatUpdate => {
            try {
                await Handler(chatUpdate, Matrix, logger);
            } catch (error) {
                console.error("Message handler error:", error);
            }
        });
        
        // Call handler
        Matrix.ev.on("call", async (json) => {
            try {
                await Callupdate(json, Matrix);
            } catch (error) {
                console.error("Call handler error:", error);
            }
        });
        
        // Group participants update handler
        Matrix.ev.on("group-participants.update", async (messag) => {
            try {
                await GroupUpdate(Matrix, messag);
            } catch (error) {
                console.error("Group update handler error:", error);
            }
        });

        // Set mode
        if (config.MODE === "public") {
            Matrix.public = true;
            console.log(chalk.yellow("🌍 Mode: PUBLIC"));
        } else if (config.MODE === "private") {
            Matrix.public = false;
            console.log(chalk.blue("🔒 Mode: PRIVATE"));
        }

        // Auto Reaction
        if (config.AUTO_REACT) {
            Matrix.ev.on('messages.upsert', async (chatUpdate) => {
                try {
                    const mek = chatUpdate.messages[0];
                    if (!mek.key.fromMe) {
                        if (mek.message) {
                            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                            await doReact(randomEmoji, mek, Matrix);
                        }
                    }
                } catch (err) {
                    console.error('Auto reaction error:', err);
                }
            });
        }

        // Auto Like Status
        if (config.AUTO_STATUS_REACT === "true") {
            Matrix.ev.on('messages.upsert', async (chatUpdate) => {
                try {
                    const mek = chatUpdate.messages[0];
                    if (!mek || !mek.message) return;

                    const contentType = getContentType(mek.message);
                    mek.message = (contentType === 'ephemeralMessage')
                        ? mek.message.ephemeralMessage.message
                        : mek.message;

                    if (mek.key.remoteJid === 'status@broadcast') {
                        const jawadlike = await Matrix.decodeJid(Matrix.user.id);
                        const emojiList = ['💖', '🔥', '⚡', '🌟', '💎', '👑', '🎯', '🚀'];
                        const randomEmoji = emojiList[Math.floor(Math.random() * emojiList.length)];

                        await Matrix.sendMessage(mek.key.remoteJid, {
                            react: {
                                text: randomEmoji,
                                key: mek.key,
                            }
                        }, { statusJidList: [mek.key.participant, jawadlike] });

                        console.log(chalk.magenta(`❤️ Auto-reacted to status: ${randomEmoji}`));
                    }
                } catch (err) {
                    console.error("Auto status error:", err);
                }
            });
        }

        console.log(chalk.green("🤖 Gifted-MD Bot is now running!"));
        return Matrix;
        
    } catch (error) {
        console.error(chalk.red('❌ Critical Error starting bot:'), error);
        return null;
    }
}

// Start bot immediately if session exists
let botInstance = null;
if (fs.existsSync(credsPath)) {
    console.log(chalk.cyan("🔍 Session found, starting bot..."));
    startBot().then(bot => {
        botInstance = bot;
    });
} else {
    console.log(chalk.yellow("⚠️ No session found. Waiting for connection..."));
}

// Express server for bot health check
app.get('/health', (req, res) => {
    res.json({
        status: 200,
        success: true,
        service: 'Gifted-MD Bot',
        timestamp: new Date().toISOString(),
        connected: !!botInstance,
        session: fs.existsSync(credsPath)
    });
});

app.listen(BOT_PORT, () => {
    console.log(chalk.cyan(`🌐 Bot API running on http://localhost:${BOT_PORT}`));
});

// Watch for session file changes
fs.watchFile(credsPath, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
        console.log(chalk.yellow("🔄 Session file updated, restarting bot..."));
        if (botInstance?.ws) {
            botInstance.ws.close();
        }
        setTimeout(() => {
            startBot().then(bot => {
                botInstance = bot;
            });
        }, 3000);
    }
});

export { startBot };
