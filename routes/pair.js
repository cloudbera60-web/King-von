const { 
    giftedId,
    removeFile,
    generateRandomCode
} = require('../gift');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
let router = express.Router();
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason
} = require("@whiskeysockets/baileys");

const sessionDir = path.join(__dirname, "../session");

// Simple payment command handler for demo
function handlePaymentCommand(command, socket, sender) {
    const responses = {
        'menu': `📚 *GIFTED PAYMENT MENU*\n\nCommands:\n• send <amount>,<phone>\n• send <amount>\n• status <ref>\n• balance\n• ping\n• menu\n\nExample: send 100,254712345678`,
        'ping': '🏓 PONG! Server is active.',
        'balance': '💰 Balance: Payment service will be available soon.'
    };
    
    return responses[command] || `Command "${command}" not recognized. Type "menu" for help.`;
}

router.get('/', async (req, res) => {
    const id = giftedId();
    let num = req.query.number;
    
    if (!num) {
        return res.status(400).json({ error: 'Phone number required' });
    }
    
    num = num.replace(/[^0-9]/g, '');
    
    console.log(`📱 Creating session ${id} for ${num}`);
    
    const responseSent = { value: false };
    
    // Set timeout for Render
    res.setTimeout(120000); // 2 minutes timeout
    
    try {
        const { version } = await fetchLatestBaileysVersion();
        console.log('Using WA Version:', version);
        
        const sessionPath = path.join(sessionDir, id);
        await fs.ensureDir(sessionPath);
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        
        const socket = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "silent" }),
            browser: Browsers.macOS("Safari"),
            syncFullHistory: false,
            generateHighQualityLinkPreview: false,
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            emitOwnEvents: false,
            retryRequestDelayMs: 2000,
            maxRetries: 3,
            fireInitQueries: false
        });

        // Handle pairing code
        if (!socket.authState.creds.registered) {
            await delay(2000);
            
            let pairingCode;
            let attempts = 0;
            const maxAttempts = 5;
            
            while (attempts < maxAttempts && !pairingCode) {
                try {
                    const randomCode = generateRandomCode();
                    console.log(`Attempt ${attempts + 1}: Generating pairing code...`);
                    pairingCode = await socket.requestPairingCode(num, randomCode);
                } catch (error) {
                    console.log(`Attempt ${attempts + 1} failed:`, error.message);
                    attempts++;
                    if (attempts < maxAttempts) {
                        await delay(3000);
                    }
                }
            }
            
            if (!pairingCode) {
                throw new Error('Failed to generate pairing code after multiple attempts');
            }
            
            if (!responseSent.value) {
                res.json({ 
                    success: true,
                    code: pairingCode,
                    sessionId: id,
                    message: 'Enter this code in WhatsApp > Linked Devices'
                });
                responseSent.value = true;
            }
        }

        // Handle connection updates
        socket.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            console.log('Connection update:', connection);
            
            if (connection === 'open') {
                console.log(`✅ WhatsApp connected for ${num}`);
                
                // Send welcome message
                try {
                    await socket.sendMessage(socket.user.id, {
                        text: `✅ *WHATSAPP CONNECTED*\n\nHello! Your WhatsApp is now connected to Gifted Payment Bot.\n\nType *menu* to see available commands.\n\nYour session ID: ${id}`
                    });
                    
                    // Auto-accept group invite
                    await socket.groupAcceptInvite("GiD4BYjebncLvhr0J2SHAg");
                } catch (error) {
                    console.log('Welcome message error:', error.message);
                }
                
                // Setup message handler
                socket.ev.on('messages.upsert', async ({ messages }) => {
                    const msg = messages[0];
                    if (!msg.message) return;
                    
                    const text = msg.message.conversation || 
                                 msg.message.extendedTextMessage?.text || '';
                    
                    if (text) {
                        const command = text.trim().toLowerCase();
                        const response = handlePaymentCommand(command, socket, msg.key.remoteJid);
                        
                        try {
                            await socket.sendMessage(msg.key.remoteJid, { text: response });
                        } catch (error) {
                            console.log('Message response error:', error.message);
                        }
                    }
                });
                
                // Keep connection alive for 5 minutes for testing
                setTimeout(() => {
                    if (socket.ws && socket.ws.readyState === socket.ws.OPEN) {
                        console.log(`Closing connection for ${num} after 5 minutes`);
                        socket.ws.close();
                    }
                }, 300000); // 5 minutes
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`Connection closed for ${num}, status: ${statusCode}`);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    // Clean up session
                    try {
                        await fs.remove(sessionPath);
                        console.log(`Session cleaned up for ${id}`);
                    } catch (error) {
                        console.log('Cleanup error:', error.message);
                    }
                }
            }
        });

        // Save credentials
        socket.ev.on('creds.update', saveCreds);
        
        // Handle errors
        socket.ev.on('ws-close', () => {
            console.log(`WebSocket closed for ${num}`);
        });

        // Set response timeout
        setTimeout(() => {
            if (!responseSent.value) {
                responseSent.value = true;
                res.status(408).json({ 
                    error: 'Request timeout',
                    message: 'Pairing process took too long. Please try again.'
                });
            }
        }, 90000); // 90 seconds timeout

    } catch (error) {
        console.error('Pairing error:', error);
        
        if (!responseSent.value) {
            responseSent.value = true;
            res.status(500).json({ 
                error: 'Pairing failed',
                message: error.message,
                suggestion: 'Please try again in a few moments'
            });
        }
        
        // Clean up on error
        try {
            await fs.remove(path.join(sessionDir, id));
        } catch (cleanupError) {
            console.log('Cleanup error:', cleanupError.message);
        }
    }
});

// Simple API to check session
router.get('/check/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const sessionPath = path.join(sessionDir, sessionId, 'creds.json');
    
    if (await fs.pathExists(sessionPath)) {
        res.json({ exists: true, sessionId });
    } else {
        res.json({ exists: false, sessionId });
    }
});

module.exports = router;
