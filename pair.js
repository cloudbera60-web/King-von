const { 
    giftedId,
    removeFile,
    generateRandomCode
} = require('../gift');
const zlib = require('zlib');
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const { sendButtons } = require('gifted-btns');
const {
    default: giftedConnect,
    useMultiFileAuthState,
    delay,
    downloadContentFromMessage, 
    generateWAMessageFromContent,
    normalizeMessageContent,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "session");
const botSessionDir = path.join(__dirname, "..", "session");

// Ensure bot session directory exists
if (!fs.existsSync(botSessionDir)) {
    fs.mkdirSync(botSessionDir, { recursive: true });
}

router.get('/', async (req, res) => {
    const id = giftedId();
    let num = req.query.number;
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                await removeFile(path.join(sessionDir, id));
            } catch (cleanupError) {
                console.error("Cleanup error:", cleanupError);
            }
            sessionCleanedUp = true;
        }
    }

    async function GIFTED_PAIR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        console.log(version);
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));
        try {
            let Gifted = giftedConnect({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
                syncFullHistory: false,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: jid => !!jid?.endsWith('@g.us'),
                getMessage: async () => undefined,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000, 
                keepAliveIntervalMs: 30000
            });

            if (!Gifted.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                
                const randomCode = generateRandomCode();
                const code = await Gifted.requestPairingCode(num, randomCode);
                
                if (!responseSent && !res.headersSent) {
                    res.json({ code: code });
                    responseSent = true;
                }
            }

            Gifted.ev.on('creds.update', saveCreds);
            Gifted.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    await Gifted.groupAcceptInvite("GiD4BYjebncLvhr0J2SHAg");

                    await delay(30000);
                    
                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 15;
                    
                    while (attempts < maxAttempts && !sessionData) {
                        try {
                            const credsPath = path.join(sessionDir, id, "creds.json");
                            if (fs.existsSync(credsPath)) {
                                const data = fs.readFileSync(credsPath);
                                if (data && data.length > 100) {
                                    sessionData = data;
                                    break;
                                }
                            }
                            await delay(8000);
                            attempts++;
                        } catch (readError) {
                            console.error("Read error:", readError);
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (sessionData) {
                        try {
                            // Save session to bot's main session directory
                            const botCredsPath = path.join(botSessionDir, "creds.json");
                            
                            // Ensure we have valid session data
                            if (sessionData && sessionData.length > 100) {
                                fs.writeFileSync(botCredsPath, sessionData);
                                console.log("✅ Session saved to bot directory");
                                
                                // Send success message to user
                                await Gifted.sendMessage(Gifted.user.id, {
                                    text: `✅ *Connected Successfully!*\n\n` +
                                          `🤖 *Gifted-MD Bot* is now starting up...\n` +
                                          `📦 All plugins are being loaded...\n` +
                                          `🚀 Bot will be ready in a few seconds!\n\n` +
                                          `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ɢɪғᴛᴇᴅ ᴛᴇᴄʜ*`
                                });
                                
                                // Trigger bot restart notification
                                console.log("🚀 Triggering bot startup...");
                                
                                // Send notification that bot will auto-start
                                await delay(2000);
                                await Gifted.sendMessage(Gifted.user.id, {
                                    text: `⚡ *Bot Status Update*\n\n` +
                                          `✅ Session: Saved\n` +
                                          `📦 Plugins: Loading...\n` +
                                          `🤖 Status: Starting...\n` +
                                          `🕐 Estimated: 5-10 seconds`
                                });
                                
                                await delay(3000);
                                await Gifted.ws.close();
                                
                                console.log("✅ Pair connection completed. Bot session saved.");
                            }
                        } catch (sessionError) {
                            console.error("Session processing error:", sessionError);
                            // Still try to send message to user
                            try {
                                await Gifted.sendMessage(Gifted.user.id, {
                                    text: `✅ Connected successfully!\n\n` +
                                          `Session saved. Bot should start automatically.\n` +
                                          `If not, please restart the bot server manually.`
                                });
                            } catch (e) {}
                        }
                    } else {
                        console.error("❌ No valid session data found");
                        try {
                            await Gifted.sendMessage(Gifted.user.id, {
                                text: "❌ Failed to save session. Please try the connection again."
                            });
                        } catch (e) {}
                    }
                    
                    await cleanUpSession();
                    
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
                    console.log("Reconnecting...");
                    await delay(5000);
                    GIFTED_PAIR_CODE();
                }
            });

        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ code: "Service is Currently Unavailable" });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    try {
        await GIFTED_PAIR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent && !res.headersSent) {
            res.status(500).json({ code: "Service Error" });
        }
    }
});

module.exports = router;
