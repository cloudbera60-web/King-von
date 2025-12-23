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
import updateHandler from '../plugins/update.js';
import express from 'express';
import pino from 'pino';
import fs from 'fs';
import { File } from 'megajs';
import NodeCache from 'node-cache';
import path from 'path';
import chalk from 'chalk';
import moment from 'moment-timezone';
import axios from 'axios';
import config from './config.cjs';
import pkg from './lib/autoreact.cjs';

const { emojis, doReact } = pkg;
const prefix = process.env.PREFIX || config.PREFIX;
const sessionName = "session";
const app = express();
const orange = chalk.bold.hex("#FFA500");
const lime = chalk.bold.hex("#32CD32");
let useQR = false;
let initialConnection = true;
const PORT = process.env.PORT || 3000;

const MAIN_LOGGER = pino({
    timestamp: () => `,"time":"${new Date().toJSON()}"`
});
const logger = MAIN_LOGGER.child({});
logger.level = "trace";

const msgRetryCounterCache = new NodeCache();

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

async function loadPlugins() {
    console.log(chalk.cyan("📦 Loading plugins..."));
    
    try {
        // Load plugin files dynamically
        const pluginsDir = path.join(__dirname, 'plugins');
        
        if (!fs.existsSync(pluginsDir)) {
            console.warn(chalk.yellow("⚠️ Plugins directory not found!"));
            return;
        }
        
        const pluginFiles = fs.readdirSync(pluginsDir).filter(file => 
            file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.mjs')
        );
        
        for (const file of pluginFiles) {
            try {
                const pluginPath = path.join(pluginsDir, file);
                console.log(chalk.gray(`  → Loading: ${file}`));
                
                // Skip update.js since it's imported separately
                if (file !== 'update.js') {
                    const plugin = await import(`file://${pluginPath}`);
                    // You might want to initialize plugins here
                }
            } catch (err) {
                console.error(chalk.red(`  ✗ Failed to load ${file}:`), err.message);
            }
        }
        
        console.log(chalk.green(`✅ Loaded ${pluginFiles.length} plugins`));
    } catch (error) {
        console.error(chalk.red("❌ Error loading plugins:"), error);
    }
}

async function start() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

        const Matrix = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: useQR,
            browser: ["GIFTED-MD", "safari", "3.3"],
            auth: state,
            getMessage: async (key) => {
                if (store) {
                    const msg = await store.loadMessage(key.remoteJid, key.id);
                    return msg.message || undefined;
                }
                return { conversation: "whatsapp user bot" };
            }
        });

        Matrix.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                    console.log(chalk.yellow("🔄 Reconnecting..."));
                    start();
                }
            } else if (connection === 'open') {
                if (initialConnection) {
                    console.log(chalk.green("✅ Connected Successfully!"));
                    
                    // Load all plugins when connected
                    loadPlugins();
                    
                    // Send connection success message
                    Matrix.sendMessage(Matrix.user.id, {
                        image: { url: "https://files.catbox.moe/8h0cyi.jpg" },
                        caption: `╭─────────────━┈⊷
│ *CONNECTED SUCCESSFULLY *
╰─────────────━┈⊷

╭─────────────━┈⊷
│BOT NAME : Gifted-MD
│DEV : GIFTED TECH
╰─────────────━┈⊷
                        
📦 Plugins loaded successfully!
🚀 Bot is now ready to use.`
                    });
                    initialConnection = false;
                } else {
                    console.log(chalk.blue("♻️ Connection reestablished after restart."));
                }
            }
        });

        Matrix.ev.on('creds.update', saveCreds);
        Matrix.ev.on("messages.upsert", async chatUpdate => await Handler(chatUpdate, Matrix, logger));
        Matrix.ev.on("call", async (json) => await Callupdate(json, Matrix));
        Matrix.ev.on("group-participants.update", async (messag) => await GroupUpdate(Matrix, messag));

        if (config.MODE === "public") {
            Matrix.public = true;
        } else if (config.MODE === "private") {
            Matrix.public = false;
        }

        // Auto Reaction to chats
        Matrix.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek.key.fromMe && config.AUTO_REACT) {
                    if (mek.message) {
                        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                        await doReact(randomEmoji, mek, Matrix);
                    }
                }
            } catch (err) {
                console.error('Error during auto reaction:', err);
            }
        });

        // Auto Like Status
        Matrix.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                const mek = chatUpdate.messages[0];
                if (!mek || !mek.message) return;

                const contentType = getContentType(mek.message);
                mek.message = (contentType === 'ephemeralMessage')
                    ? mek.message.ephemeralMessage.message
                    : mek.message;

                if (mek.key.remoteJid === 'status@broadcast' && config.AUTO_STATUS_REACT === "true") {
                    const jawadlike = await Matrix.decodeJid(Matrix.user.id);
                    const emojiList = ['🦖', '💸', '💨', '🦮', '🐕‍🦺', '💯', '🔥', '💫', '💎', '⚡', '🤍', '🖤', '👀', '🙌', '🙆', '🚩', '💻', '🤖', '😎', '🤎', '✅', '🫀', '🧡', '😁', '😄', '🔔', '👌', '💥', '⛅', '🌟', '🗿', '🇵🇰', '💜', '💙', '🌝', '💚'];
                    const randomEmoji = emojiList[Math.floor(Math.random() * emojiList.length)];

                    await Matrix.sendMessage(mek.key.remoteJid, {
                        react: {
                            text: randomEmoji,
                            key: mek.key,
                        }
                    }, { statusJidList: [mek.key.participant, jawadlike] });

                    console.log(`Auto-reacted to a status with: ${randomEmoji}`);
                }
            } catch (err) {
                console.error("Auto Like Status Error:", err);
            }
        });

        console.log(chalk.magenta("🤖 Bot is now running! Waiting for messages..."));

    } catch (error) {
        console.error(chalk.red('❌ Critical Error:'), error);
        process.exit(1);
    }
}

async function init() {
    // Check for existing session
    if (fs.existsSync(credsPath)) {
        console.log(chalk.green("🔒 Session file found, starting bot..."));
        await start();
    } else {
        console.log(chalk.yellow("⚠️ No session found. Please use QR/Pair code first."));
        console.log(chalk.cyan("🌐 Visit: http://localhost:50900 to connect"));
        
        // You can also trigger the QR generation here
        // For now, exit since no session exists
        process.exit(0);
    }
}

// Start the bot
init();

// Express server for health check
app.get('/health', (req, res) => {
    res.json({
        status: 200,
        success: true,
        service: 'Gifted-MD Bot',
        timestamp: new Date().toISOString(),
        connected: initialConnection ? false : true
    });
});

app.listen(PORT, () => {
    console.log(chalk.cyan(`🌐 Bot server running on http://localhost:${PORT}`));
});
