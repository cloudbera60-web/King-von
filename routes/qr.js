const { 
    giftedId,
    removeFile
} = require('../gift');
const QRCode = require('qrcode');
const express = require('express');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const {
    default: giftedConnect,
    useMultiFileAuthState,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "../session");
const botSessionDir = path.join(__dirname, "../session");

// Ensure bot session directory exists
if (!fs.existsSync(botSessionDir)) {
    fs.mkdirSync(botSessionDir, { recursive: true });
}

router.get('/', async (req, res) => {
    const id = giftedId();
    let responseSent = false;
    let sessionCleanedUp = false;

    async function cleanUpSession() {
        if (!sessionCleanedUp) {
            try {
                await removeFile(path.join(sessionDir, id));
            } catch (error) {
                console.error("Cleanup error:", error);
            }
            sessionCleanedUp = true;
        }
    }

    async function GIFTED_QR_CODE() {
        const { version } = await fetchLatestBaileysVersion();
        console.log("Using WA Version:", version);
        
        const { state, saveCreds } = await useMultiFileAuthState(path.join(sessionDir, id));
        
        try {
            let Gifted = giftedConnect({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.macOS("Desktop"),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000
            });

            Gifted.ev.on('creds.update', saveCreds);
            
            Gifted.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;
                
                // Show QR Code
                if (qr && !responseSent) {
                    try {
                        const qrImage = await QRCode.toDataURL(qr);
                        if (!res.headersSent) {
                            res.send(`
                                <!DOCTYPE html>
                                <html>
                                <head>
                                    <title>GIFTED-MD | QR CODE</title>
                                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                                    <style>
                                        body {
                                            display: flex;
                                            justify-content: center;
                                            align-items: center;
                                            min-height: 100vh;
                                            margin: 0;
                                            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
                                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                                            color: #fff;
                                            text-align: center;
                                            padding: 20px;
                                            box-sizing: border-box;
                                        }
                                        .container {
                                            width: 100%;
                                            max-width: 500px;
                                            background: rgba(255, 255, 255, 0.05);
                                            backdrop-filter: blur(10px);
                                            border-radius: 20px;
                                            padding: 30px;
                                            border: 1px solid rgba(123, 44, 191, 0.3);
                                            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
                                        }
                                        h1 {
                                            color: #fff;
                                            margin: 0 0 20px 0;
                                            font-size: 28px;
                                            font-weight: 800;
                                            background: linear-gradient(to right, #7b2cbf, #ff9e00);
                                            -webkit-background-clip: text;
                                            background-clip: text;
                                            color: transparent;
                                        }
                                        .qr-container {
                                            margin: 20px auto;
                                            width: 280px;
                                            height: 280px;
                                            display: flex;
                                            justify-content: center;
                                            align-items: center;
                                        }
                                        .qr-code {
                                            width: 280px;
                                            height: 280px;
                                            padding: 15px;
                                            background: white;
                                            border-radius: 20px;
                                            box-shadow: 0 10px 30px rgba(123, 44, 191, 0.4);
                                            animation: pulse 2s infinite;
                                        }
                                        .qr-code img {
                                            width: 100%;
                                            height: 100%;
                                        }
                                        p {
                                            color: #ccc;
                                            margin: 20px 0;
                                            font-size: 16px;
                                            line-height: 1.6;
                                        }
                                        .status {
                                            color: #ff9e00;
                                            font-weight: 600;
                                            margin: 15px 0;
                                            padding: 10px;
                                            background: rgba(255, 158, 0, 0.1);
                                            border-radius: 10px;
                                            font-size: 14px;
                                        }
                                        .back-btn {
                                            display: inline-block;
                                            padding: 12px 30px;
                                            margin-top: 15px;
                                            background: linear-gradient(135deg, #7b2cbf 0%, #9d4edd 100%);
                                            color: white;
                                            text-decoration: none;
                                            border-radius: 30px;
                                            font-weight: bold;
                                            border: none;
                                            cursor: pointer;
                                            transition: all 0.3s ease;
                                            box-shadow: 0 4px 15px rgba(123, 44, 191, 0.3);
                                        }
                                        .back-btn:hover {
                                            transform: translateY(-3px);
                                            box-shadow: 0 8px 25px rgba(123, 44, 191, 0.5);
                                        }
                                        @keyframes pulse {
                                            0% {
                                                box-shadow: 0 10px 30px rgba(123, 44, 191, 0.4);
                                            }
                                            50% {
                                                box-shadow: 0 10px 30px rgba(123, 44, 191, 0.8);
                                            }
                                            100% {
                                                box-shadow: 0 10px 30px rgba(123, 44, 191, 0.4);
                                            }
                                        }
                                        @media (max-width: 480px) {
                                            .container {
                                                padding: 20px;
                                            }
                                            .qr-container {
                                                width: 250px;
                                                height: 250px;
                                            }
                                            .qr-code {
                                                width: 250px;
                                                height: 250px;
                                            }
                                            h1 {
                                                font-size: 24px;
                                            }
                                        }
                                    </style>
                                </head>
                                <body>
                                    <div class="container">
                                        <h1>GIFTED QR CODE</h1>
                                        <div class="qr-container">
                                            <div class="qr-code">
                                                <img src="${qrImage}" alt="QR Code"/>
                                            </div>
                                        </div>
                                        <p>Scan this QR code with your WhatsApp phone to connect</p>
                                        <div class="status">
                                            ⚡ Bot will start automatically after successful scan
                                        </div>
                                        <p style="font-size: 14px; color: #999;">
                                            Keep this page open while scanning
                                        </p>
                                        <a href="./" class="back-btn">Back to Home</a>
                                    </div>
                                    <script>
                                        // Auto-reload if connection takes too long
                                        setTimeout(() => {
                                            if (!window.location.href.includes('connected=true')) {
                                                console.log('Still waiting for connection...');
                                            }
                                        }, 30000);
                                    </script>
                                </body>
                                </html>
                            `);
                            responseSent = true;
                        }
                    } catch (qrError) {
                        console.error("QR generation error:", qrError);
                        if (!responseSent) {
                            res.status(500).json({ error: "Failed to generate QR code" });
                            responseSent = true;
                        }
                    }
                }

                // Connection successful
                if (connection === "open") {
                    console.log("✅ WhatsApp connected successfully!");
                    
                    try {
                        // Accept group invite
                        await Gifted.groupAcceptInvite("GiD4BYjebncLvhr0J2SHAg");
                        console.log("✅ Joined group");
                    } catch (groupError) {
                        console.warn("⚠️ Could not join group:", groupError.message);
                    }

                    await delay(8000);

                    // Wait for session file to be created
                    let sessionSaved = false;
                    let attempts = 0;
                    const maxAttempts = 15;
                    
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
                                    await delay(2000);
                                    await Gifted.sendMessage(Gifted.user.id, {
                                        text: `📋 *Bot Startup Status*\n\n` +
                                              `✅ Session: Saved successfully\n` +
                                              `📁 Location: /session/creds.json\n` +
                                              `🔄 Status: Starting bot server...\n` +
                                              `⏱️ Estimated: 5-10 seconds`
                                    });
                                    
                                    break;
                                }
                            }
                            await delay(2000);
                            attempts++;
                            console.log(`⏳ Waiting for session... Attempt ${attempts}/${maxAttempts}`);
                        } catch (readError) {
                            console.error("Session read error:", readError);
                            await delay(2000);
                            attempts++;
                        }
                    }

                    if (!sessionSaved) {
                        console.error("❌ Failed to save session after maximum attempts");
                        await Gifted.sendMessage(Gifted.user.id, {
                            text: "❌ Failed to save session. Please try reconnecting."
                        });
                    }
                    
                    // Cleanup and close connection
                    await delay(3000);
                    try {
                        await Gifted.ws.close();
                    } catch (closeError) {
                        console.log("Connection closed");
                    }
                    
                    await cleanUpSession();
                    
                    // Send final message to user
                    if (sessionSaved) {
                        console.log("🚀 Bot session saved successfully!");
                        console.log("💡 Bot should auto-start if the main server is running");
                    }
                    
                } else if (connection === "close") {
                    console.log("🔌 Connection closed");
                    if (lastDisconnect?.error) {
                        console.error("Disconnect error:", lastDisconnect.error);
                    }
                    
                    if (lastDisconnect?.error?.output?.statusCode !== 401) {
                        console.log("🔄 Attempting to reconnect...");
                        await delay(5000);
                        await cleanUpSession();
                        GIFTED_QR_CODE();
                    }
                }
            });

        } catch (err) {
            console.error("Main error:", err);
            if (!responseSent) {
                res.status(500).json({ error: "QR Service is Currently Unavailable", details: err.message });
                responseSent = true;
            }
            await cleanUpSession();
        }
    }

    try {
        await GIFTED_QR_CODE();
    } catch (finalError) {
        console.error("Final error:", finalError);
        await cleanUpSession();
        if (!responseSent) {
            res.status(500).json({ error: "Service Error", details: finalError.message });
        }
    }
});

module.exports = router;
