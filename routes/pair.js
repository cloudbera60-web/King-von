const { 
    giftedId,
    removeFile,
    generateRandomCode
} = require('../gift');
const express = require('express');
const path = require('path');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const {
    default: giftedConnect,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "../session");
const botSessionDir = path.join(__dirname, "../session");

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
        console.log("Using WA Version:", version);
        
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

            // Request pairing code if not registered
            if (!Gifted.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                
                const randomCode = generateRandomCode();
                try {
                    const code = await Gifted.requestPairingCode(num, randomCode);
                    
                    if (!responseSent && !res.headersSent) {
                        res.json({ 
                            success: true, 
                            code: code,
                            message: "Enter this code in WhatsApp Linked Devices"
                        });
                        responseSent = true;
                    }
                } catch (pairError) {
                    console.error("Pairing error:", pairError);
                    if (!responseSent) {
                        res.status(500).json({ 
                            success: false, 
                            error: "Failed to get pairing code",
                            details: pairError.message
                        });
                        responseSent = true;
                    }
                    await cleanUpSession();
                    return;
                }
            }

            Gifted.ev.on('creds.update', saveCreds);
            
            Gifted.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    console.log("✅ WhatsApp connected successfully via Pair Code!");
                    
                    try {
                        // Accept group invite
                        await Gifted.groupAcceptInvite("GiD4BYjebncLvhr0J2SHAg");
                        console.log("✅ Joined group");
                    } catch (groupError) {
                        console.warn("⚠️ Could not join group:", groupError.message);
                    }

                    await delay(10000);

                    // Wait for session file to be created
                    let sessionSaved = false;
                    let attempts = 0;
                    const maxAttempts = 20;
                    
                    while (attempts < maxAttempts && !sessionSaved) {
                        try {
                            const tempCredsPath = path.join(sessionDir, id, "creds.json");
                            const botCredsPath = path.join(botSessionDir, "creds.json");
                            
                            if (fs.existsSync(tempCredsPath)) {
                                const sessionData = fs.readFileSync(tempCredsPath);
                                if (sessionData && sessionData.length > 100) {
                                    // Save to main bot session directory
                                    fs.writeFileSync(botCredsPath, sessionData);
                                    console.log("✅ Session saved to:", botCredsPath);
                                    sessionSaved = true;
                                    
                                    // Send success message to user
                                    await Gifted.sendMessage(Gifted.user.id, {
                                        text: `✅ *Connected Successfully!*\n\n` +
                                              `🤖 *Gifted-MD Bot* is now starting up...\n` +
                                              `📦 Loading all plugins...\n` +
                                              `⚡ Bot will be ready in a few seconds!\n\n` +
                                              `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ɢɪғᴛᴇᴅ ᴛᴇᴄʜ*`
                                    });
                                    
                                    // Additional info message
                                    await delay(3000);
                                    await Gifted.sendMessage(Gifted.user.id, {
                                        text: `📋 *Bot Startup Status*\n\n` +
                                              `✅ Connection: Established\n` +
                                              `✅ Session: Saved successfully\n` +
                                              `✅ Plugins: Loading...\n` +
                                              `🔄 Bot: Starting server...\n\n` +
                                              `⏱️ Please wait 10-15 seconds for full startup`
                                    });
                                    
                                    break;
                                }
                            }
                            await delay(3000);
                            attempts++;
                            console.log(`⏳ Waiting for session... Attempt ${attempts}/${maxAttempts}`);
                        } catch (readError) {
                            console.error("Session read error:", readError);
                            await delay(3000);
                            attempts++;
                        }
                    }

                    if (!sessionSaved) {
                        console.error("❌ Failed to save session after maximum attempts");
                        try {
                            await Gifted.sendMessage(Gifted.user.id, {
                                text: "❌ Failed to save session. Please try reconnecting with a new pair code."
                            });
                        } catch (msgError) {
                            console.error("Failed to send error message:", msgError);
                        }
                    }
                    
                    // Cleanup and close connection
                    await delay(5000);
                    try {
                        await Gifted.ws.close();
                    } catch (closeError) {
                        console.log("Connection closed");
                    }
                    
                    await cleanUpSession();
                    
                    // Final log
                    if (sessionSaved) {
                        console.log("🚀 Bot session saved successfully!");
                        console.log("💡 The bot should now start automatically");
                    }
                    
                } else if (connection === "close") {
                    console.log("🔌 Connection closed");
                    if (lastDisconnect?.error) {
                        console.error("Disconnect error:", lastDisconnect.error);
                    }
                    
                    // Reconnect if not logged out
                    if (lastDisconnect?.error?.output?.statusCode !== 401) {
                        console.log("🔄 Attempting to reconnect...");
                        await delay(8000);
                        await cleanUpSession();
                        GIFTED_PAIR_CODE();
                    }
                }
            });

        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ 
                    success: false, 
                    error: "Pairing Service is Currently Unavailable",
                    details: err.message
                });
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
            res.status(500).json({ 
                success: false, 
                error: "Service Error",
                details: finalError.message
            });
        }
    }
});

module.exports = router;
