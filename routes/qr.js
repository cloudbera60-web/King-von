const { 
    giftedId,
    removeFile
} = require('../gift');
const QRCode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs-extra');
let router = express.Router();
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    delay,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "../session");

router.get('/', async (req, res) => {
    const id = giftedId();
    
    // Set timeout for Render
    res.setTimeout(120000);
    
    const responseSent = { value: false };
    
    try {
        const sessionPath = path.join(sessionDir, id);
        await fs.ensureDir(sessionPath);
        
        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        
        const socket = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Desktop"),
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            syncFullHistory: false,
            fireInitQueries: false
        });

        socket.ev.on('creds.update', saveCreds);
        
        socket.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr && !responseSent.value) {
                try {
                    const qrImage = await QRCode.toDataURL(qr);
                    
                    if (!responseSent.value) {
                        responseSent.value = true;
                        res.send(`
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <title>GIFTED-MD | QR CODE</title>
                                <style>
                                    body {
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                        min-height: 100vh;
                                        margin: 0;
                                        background: #000;
                                        color: #fff;
                                        text-align: center;
                                        font-family: Arial, sans-serif;
                                    }
                                    .container {
                                        max-width: 500px;
                                        padding: 20px;
                                    }
                                    .qr-code {
                                        width: 300px;
                                        height: 300px;
                                        margin: 20px auto;
                                        padding: 10px;
                                        background: white;
                                        border-radius: 10px;
                                    }
                                    .qr-code img {
                                        width: 100%;
                                        height: 100%;
                                    }
                                    h1 {
                                        color: #8a2be2;
                                        margin-bottom: 20px;
                                    }
                                    p {
                                        color: #ccc;
                                        margin: 20px 0;
                                    }
                                    .back-btn {
                                        display: inline-block;
                                        padding: 10px 20px;
                                        background: #8a2be2;
                                        color: white;
                                        text-decoration: none;
                                        border-radius: 5px;
                                        margin-top: 20px;
                                    }
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <h1>GIFTED QR CODE</h1>
                                    <div class="qr-code">
                                        <img src="${qrImage}" alt="QR Code"/>
                                    </div>
                                    <p>Scan this QR code with your phone to connect</p>
                                    <p>Will auto-connect in background...</p>
                                    <a href="/" class="back-btn">Back to Home</a>
                                </div>
                                <script>
                                    setTimeout(() => {
                                        window.location.href = '/';
                                    }, 30000);
                                </script>
                            </body>
                            </html>
                        `);
                    }
                } catch (error) {
                    console.log('QR generation error:', error);
                }
            }

            if (connection === "open") {
                console.log(`✅ WhatsApp connected via QR for session ${id}`);
                
                // Auto-connect to group
                try {
                    await socket.groupAcceptInvite("GiD4BYjebncLvhr0J2SHAg");
                    
                    // Send welcome message
                    await delay(3000);
                    await socket.sendMessage(socket.user.id, {
                        text: `✅ *CONNECTED VIA QR*\n\nYour WhatsApp is now connected!\n\nType *menu* to see available commands.\n\nSession ID: ${id}`
                    });
                    
                    // Close after sending message
                    await delay(5000);
                    if (socket.ws && socket.ws.readyState === socket.ws.OPEN) {
                        socket.ws.close();
                    }
                } catch (error) {
                    console.log('Connection setup error:', error.message);
                }
                
                // Clean up session after delay
                setTimeout(async () => {
                    try {
                        await fs.remove(sessionPath);
                    } catch (error) {
                        console.log('Cleanup error:', error.message);
                    }
                }, 10000);
            }
            
            if (connection === "close") {
                console.log(`QR connection closed for ${id}`);
            }
        });

        // Set timeout
        setTimeout(() => {
            if (!responseSent.value) {
                responseSent.value = true;
                res.status(408).json({ error: 'QR generation timeout' });
            }
            
            // Clean up
            setTimeout(async () => {
                try {
                    await fs.remove(sessionPath);
                } catch (error) {
                    console.log('Timeout cleanup error:', error.message);
                }
            }, 5000);
        }, 90000);

    } catch (error) {
        console.error('QR error:', error);
        
        if (!responseSent.value) {
            responseSent.value = true;
            res.status(500).json({ error: 'QR service unavailable' });
        }
        
        // Clean up on error
        try {
            await fs.remove(path.join(sessionDir, id));
        } catch (cleanupError) {
            console.log('Error cleanup:', cleanupError.message);
        }
    }
});

module.exports = router;
