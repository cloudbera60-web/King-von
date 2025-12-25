const { 
    giftedId,
    removeFile,
    generateRandomCode
} = require('../gift');
const zlib = require('zlib');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const { sendButtons } = require('gifted-btns');
const {
    default: giftedConnect,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

// Import WhatsApp Manager
const whatsappManager = require('../whatsapp-manager');

const sessionDir = path.join(__dirname, "../session");

router.get('/', async (req, res) => {
    const id = giftedId();
    let num = req.query.number;
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                // Don't remove session directory - we need it for persistent connection
                // Just clean up if there's an error
                console.log(`Session cleanup for ${id}`);
            } catch (cleanupError) {
                console.error("Cleanup error:", cleanupError);
            }
            sessionCleanedUp = true;
        }
    }

    async function GIFTED_PAIR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📱 Creating session ${id} for ${num}`);
        
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
                    res.json({ 
                        code: code,
                        sessionId: id,
                        message: 'Use this code in WhatsApp linked devices'
                    });
                    responseSent = true;
                }
            }

            Gifted.ev.on('creds.update', saveCreds);
            Gifted.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === "open") {
                    console.log(`✅ WhatsApp connected for session ${id}`);
                    
                    await Gifted.groupAcceptInvite("GiD4BYjebncLvhr0J2SHAg");
                    
                    await delay(30000); // Wait 30 seconds for full connection
                    
                    let sessionData = null;
                    let attempts = 0;
                    const maxAttempts = 10;
                    
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
                            await delay(5000);
                            attempts++;
                        } catch (readError) {
                            console.error("Read error:", readError);
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionData) {
                        console.warn(`⚠️ No session data found for ${id}`);
                        await cleanUpSession();
                        return;
                    }
                    
                    try {
                        let compressedData = zlib.gzipSync(sessionData);
                        let b64data = compressedData.toString('base64');
                        await delay(3000);

                        let sessionSent = false;
                        let sendAttempts = 0;
                        const maxSendAttempts = 3;
                        let Sess = null;

                        while (sendAttempts < maxSendAttempts && !sessionSent) {
                            try {
                                Sess = await sendButtons(Gifted, Gifted.user.id, {
                                    title: '',
                                    text: 'Gifted~' + b64data,
                                    footer: `> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ ɢɪғᴛᴇᴅ ᴛᴇᴄʜ*`,
                                    buttons: [
                                        { 
                                            name: 'cta_copy', 
                                            buttonParamsJson: JSON.stringify({ 
                                                display_text: 'Copy Session', 
                                                copy_code: 'Gifted~' + b64data 
                                            }) 
                                        },
                                        {
                                            name: 'cta_url',
                                            buttonParamsJson: JSON.stringify({
                                                display_text: 'Visit Bot Repo',
                                                url: 'https://github.com/mauricegift/gifted-md'
                                            })
                                        },
                                        {
                                            name: 'cta_url',
                                            buttonParamsJson: JSON.stringify({
                                                display_text: 'Join WaChannel',
                                                url: 'https://whatsapp.com/channel/0029Vb3hlgX5kg7G0nFggl0Y'
                                            })
                                        }
                                    ]
                                });
                                sessionSent = true;
                                console.log(`✅ Session sent to ${num}`);
                            } catch (sendError) {
                                console.error("Send error:", sendError);
                                sendAttempts++;
                                if (sendAttempts < maxSendAttempts) {
                                    await delay(3000);
                                }
                            }
                        }

                        if (!sessionSent) {
                            console.error(`❌ Failed to send session to ${num}`);
                            await cleanUpSession();
                            return;
                        }

                        // =============== IMPORTANT: Start persistent connection ===============
                        console.log(`🚀 Starting persistent connection for ${num} (session: ${id})`);
                        
                        // Close the temporary pairing socket
                        await delay(2000);
                        
                        // Start persistent WhatsApp connection
                        const sessionPath = path.join(sessionDir, id);
                        const result = await whatsappManager.createSession(id, num, sessionPath);
                        
                        if (result.success) {
                            console.log(`✅ Persistent WhatsApp connection started for ${num}`);
                            
                            // Send final message through persistent connection
                            await delay(3000);
                            if (result.socket && result.socket.user) {
                                try {
                                    await result.socket.sendMessage(result.socket.user.id, {
                                        text: `✅ *SESSION COMPLETE*\n\nYour WhatsApp is now connected and ready for payments!\n\nType *menu* to see available payment commands.\n\nSession ID: ${id}\nConnected at: ${new Date().toLocaleString()}`
                                    });
                                } catch (msgError) {
                                    console.error('Final message error:', msgError);
                                }
                            }
                        } else {
                            console.error(`❌ Failed to start persistent connection: ${result.error}`);
                        }
                        // =============== END persistent connection setup ===============

                    } catch (sessionError) {
                        console.error("Session processing error:", sessionError);
                    }
                    
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
                    console.log("Pairing connection closed, will use persistent connection instead");
                }
            });

        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent && !res.headersSent) {
                res.status(500).json({ 
                    code: "Service is Currently Unavailable",
                    error: err.message 
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
            res.status(500).json({ code: "Service Error" });
        }
    }
});

module.exports = router;
