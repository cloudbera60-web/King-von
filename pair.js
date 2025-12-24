
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');

// ==================== STK PAYMENT CONFIGURATION ====================
const { PayHeroClient } = require('payhero-devkit');

// STK Payment Configuration
const stkConfig = {
    PAYHERO_AUTH_TOKEN: process.env.PAYHERO_AUTH_TOKEN || '',
    DEFAULT_PROVIDER: 'm-pesa',
    CHANNEL_ID: process.env.CHANNEL_ID || '3342',
    
    // STK Commands (non-prefix mode)
    COMMANDS: {
        PING: 'ping',
        SEND: 'send',
        HELP: 'help',
        BALANCE: 'balance',
        STATUS: 'status',
        MENU: 'menu'
    }
};

// Initialize PayHero Client if token exists
let payheroClient = null;
if (stkConfig.PAYHERO_AUTH_TOKEN) {
    try {
        payheroClient = new PayHeroClient({
            authToken: stkConfig.PAYHERO_AUTH_TOKEN
        });
        console.log('✅ PayHero STK Client initialized');
    } catch (error) {
        console.error('❌ Failed to initialize PayHero client:', error.message);
    }
} else {
    console.log('⚠️ PayHero auth token not set. STK payments will not work.');
}

// Track payment requests
const paymentRequests = new Map();

// STK Payment Functions
function formatPhoneNumber(phone) {
    let formattedPhone = phone.trim();
    
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('+')) {
        formattedPhone = formattedPhone.substring(1);
    }
    
    if (!formattedPhone.startsWith('254')) {
        return null;
    }
    
    return formattedPhone;
}

async function initiateSTKPush(phone, amount, sender, reference = null) {
    try {
        if (!payheroClient) {
            return {
                success: false,
                error: 'Payment service not available. Please contact admin.'
            };
        }
        
        const formattedPhone = formatPhoneNumber(phone);
        
        if (!formattedPhone) {
            return {
                success: false,
                error: 'Phone number must be in format 2547XXXXXXXX or 07XXXXXXXX'
            };
        }
        
        if (parseFloat(amount) <= 0) {
            return {
                success: false,
                error: 'Amount must be greater than 0'
            };
        }
        
        const stkPayload = {
            phone_number: formattedPhone,
            amount: parseFloat(amount),
            provider: stkConfig.DEFAULT_PROVIDER,
            channel_id: stkConfig.CHANNEL_ID,
            external_reference: reference || `WHATSAPP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            customer_name: sender || 'WhatsApp Customer'
        };
        
        console.log('🔄 Initiating WhatsApp STK Push:', {
            phone: formattedPhone,
            amount: amount,
            reference: stkPayload.external_reference
        });
        
        const response = await payheroClient.stkPush(stkPayload);
        
        // Store payment request for tracking
        paymentRequests.set(stkPayload.external_reference, {
            phone: formattedPhone,
            amount: amount,
            sender: sender,
            timestamp: Date.now(),
            status: 'pending'
        });
        
        return {
            success: true,
            message: 'STK push initiated successfully',
            data: response,
            reference: stkPayload.external_reference
        };
    } catch (error) {
        console.error('❌ STK Push Error:', error);
        return {
            success: false,
            error: error.message || 'Failed to initiate STK push'
        };
    }
}

async function checkTransactionStatus(reference) {
    try {
        if (!payheroClient) {
            return {
                success: false,
                error: 'Payment service not available'
            };
        }
        
        const response = await payheroClient.transactionStatus(reference);
        
        // Update payment request status
        if (paymentRequests.has(reference)) {
            const payment = paymentRequests.get(reference);
            payment.status = response.status || 'unknown';
            payment.lastChecked = Date.now();
            paymentRequests.set(reference, payment);
        }
        
        return {
            success: true,
            data: response
        };
    } catch (error) {
        console.error('❌ Transaction Status Error:', error);
        return {
            success: false,
            error: error.message || 'Failed to get transaction status'
        };
    }
}

async function getWalletBalance() {
    try {
        if (!payheroClient) {
            return {
                success: false,
                error: 'Payment service not available'
            };
        }
        
        const balance = await payheroClient.serviceWalletBalance();
        return {
            success: true,
            data: balance
        };
    } catch (error) {
        console.error('❌ Wallet Balance Error:', error);
        return {
            success: false,
            error: error.message || 'Failed to get wallet balance'
        };
    }
}

// Format message for WhatsApp
function formatSTKMessage(title, content, footer) {
    return `*${title}*\n\n${content}\n\n> *${footer}*`;
}
// ==================== END STK PAYMENT CONFIGURATION ====================

const { sms } = require("./msg");

// BAILEYS IMPORT
const baileysImport = require('@whiskeysockets/baileys');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    DisconnectReason,
    fetchLatestBaileysVersion
} = baileysImport;

process.env.NODE_ENV = 'production';

console.log('🚀 STK Payment Bot with Auto Status Features');

const config = {
    // Auto Status Settings ONLY
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'true',
    AUTO_LIKE_EMOJI: ['💗', '🩵', '🥺', '🫶', '😶', '💳', '💰', '💸'],
    
    // Command Settings - Non-prefix mode
    PREFIX: '', // Empty string for non-prefix commands
    MAX_RETRIES: 3,
    
    // File Paths
    SESSION_BASE_PATH: './session',
    
    // Session auto-management
    AUTO_SAVE_INTERVAL: 300000,
    AUTO_CLEANUP_INTERVAL: 900000,
    
    // Connection settings
    CONNECTION_TIMEOUT: 60000
};

// Session Management Maps
const activeSockets = new Map();
const sessionHealth = new Map();
const sessionConnectionStatus = new Map();
const reconnectionAttempts = new Map();
const disconnectionTime = new Map();

// Helper functions
function getSriLankaTimestamp() {
    return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss');
}

// Check if socket is ready
function isSocketReady(socket) {
    if (!socket) return false;
    return socket.ws && socket.ws.readyState === socket.ws.OPEN;
}

// Check if session is active
function isSessionActive(number) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const health = sessionHealth.get(sanitizedNumber);
    const connectionStatus = sessionConnectionStatus.get(sanitizedNumber);
    const socket = activeSockets.get(sanitizedNumber);

    return (
        connectionStatus === 'open' &&
        health === 'active' &&
        socket &&
        socket.user &&
        !disconnectionTime.has(sanitizedNumber)
    );
}

// AUTO STATUS HANDLERS ONLY
async function setupStatusHandlers(socket) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

        try {
            // Auto recording presence
            if (config.AUTO_RECORDING === 'true' && message.key.remoteJid) {
                await socket.sendPresenceUpdate("recording", message.key.remoteJid);
            }

            // Auto view status
            if (config.AUTO_VIEW_STATUS === 'true') {
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.readMessages([message.key]);
                        console.log('✅ Auto-viewed status');
                        break;
                    } catch (error) {
                        retries--;
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }

            // Auto like status with emoji
            if (config.AUTO_LIKE_STATUS === 'true') {
                const randomEmoji = config.AUTO_LIKE_EMOJI[
                    Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)
                ];
                
                let retries = config.MAX_RETRIES;
                while (retries > 0) {
                    try {
                        await socket.sendMessage(
                            message.key.remoteJid,
                            { 
                                react: { 
                                    text: randomEmoji, 
                                    key: message.key 
                                } 
                            },
                            { statusJidList: [message.key.participant] }
                        );
                        console.log(`✅ Reacted to status with ${randomEmoji}`);
                        break;
                    } catch (error) {
                        retries--;
                        console.warn(`⚠️ Failed to react to status, retries left: ${retries}`, error);
                        if (retries === 0) throw error;
                        await delay(1000 * (config.MAX_RETRIES - retries));
                    }
                }
            }
        } catch (error) {
            console.error('❌ Status handler error:', error);
        }
    });
}

// Connection restart handler
function setupAutoRestart(socket, number) {
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        const sanitizedNumber = number.replace(/[^0-9]/g, '');

        sessionConnectionStatus.set(sanitizedNumber, connection);

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message || '';
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            disconnectionTime.set(sanitizedNumber, Date.now());
            sessionHealth.set(sanitizedNumber, 'disconnected');
            sessionConnectionStatus.set(sanitizedNumber, 'closed');

            if (shouldReconnect) {
                console.log(`🔄 Connection closed for ${number}, attempting reconnect...`);
                sessionHealth.set(sanitizedNumber, 'reconnecting');

                const attempts = reconnectionAttempts.get(sanitizedNumber) || 0;
                if (attempts < 3) { // MAX_FAILED_ATTEMPTS
                    await delay(10000);
                    activeSockets.delete(sanitizedNumber);
                    // Reconnect logic would go here
                } else {
                    console.log(`❌ Max reconnection attempts reached for ${number}`);
                }
            }
        } else if (connection === 'open') {
            console.log(`✅ Connection open: ${number}`);
            sessionHealth.set(sanitizedNumber, 'active');
            sessionConnectionStatus.set(sanitizedNumber, 'open');
            reconnectionAttempts.delete(sanitizedNumber);
            disconnectionTime.delete(sanitizedNumber);
        }
    });
}

// STK COMMAND HANDLERS
async function handleSTKCommands(socket, message, sender, senderName) {
    try {
        const text = message.conversation || 
                    message.extendedTextMessage?.text || 
                    message.imageMessage?.caption || 
                    '';
        
        if (!text.trim()) return;
        
        const [command, ...args] = text.trim().toLowerCase().split(/\s+/);
        
        console.log(`📩 Command received: ${command}`, { args, sender: senderName });
        
        // Handle ping command
        if (command === 'ping') {
            const start = Date.now();
            const timestamp = getSriLankaTimestamp();
            const latency = Date.now() - start;
            
            const response = formatSTKMessage(
                '🏓 PONG!',
                `Response Time: ${latency}ms\nServer Time: ${timestamp}\nConnection: ✅ Active\nUptime: ${process.uptime().toFixed(2)}s`,
                'STK Payment Bot'
            );
            
            await socket.sendMessage(sender, { text: response });
            return;
        }
        
        // Handle send command
        if (command === 'send') {
            if (args.length < 1) {
                await socket.sendMessage(sender, {
                    text: formatSTKMessage(
                        '❌ Invalid Command',
                        'Usage: send <amount>,<phone>\nExample: send 100,254712345678\n\nOr: send <amount>\n(Will use your WhatsApp number)\n\nType "help" for more commands',
                        'STK Payment Bot'
                    )
                });
                return;
            }
            
            let amount, phone;
            
            // Check if command format is "send 100,254712345678"
            if (args[0].includes(',')) {
                [amount, phone] = args[0].split(',');
            } else {
                amount = args[0];
                // If no phone provided, use sender's number
                phone = sender.split('@')[0];
            }
            
            // Validate amount
            if (isNaN(amount) || parseFloat(amount) <= 0) {
                await socket.sendMessage(sender, {
                    text: formatSTKMessage(
                        '❌ Invalid Amount',
                        'Please enter a valid amount greater than 0\nExample: send 100',
                        'STK Payment Bot'
                    )
                });
                return;
            }
            
            // Send processing message
            await socket.sendMessage(sender, {
                text: formatSTKMessage(
                    '🔄 Processing Payment',
                    `Amount: KES ${amount}\nPhone: ${phone}\n\nPlease wait while we process your request...`,
                    'STK Payment Bot'
                )
            });
            
            // Initiate STK Push
            const result = await initiateSTKPush(phone, amount, senderName);
            
            if (result.success) {
                const responseMessage = formatSTKMessage(
                    '✅ Payment Request Sent',
                    `Amount: KES ${amount}\nPhone: ${phone}\nReference: ${result.reference}\n\nCheck your phone for M-Pesa prompt and enter your PIN to complete payment.\n\nUse: status ${result.reference} to check payment status.`,
                    'STK Payment Bot'
                );
                
                await socket.sendMessage(sender, { text: responseMessage });
                
                // Send reminder after 30 seconds
                setTimeout(async () => {
                    if (paymentRequests.get(result.reference)?.status === 'pending') {
                        await socket.sendMessage(sender, {
                            text: formatSTKMessage(
                                '⏰ Payment Reminder',
                                `Payment request for KES ${amount} is still pending.\nCheck your phone for M-Pesa prompt.`,
                                'STK Payment Bot'
                            )
                        });
                    }
                }, 30000);
                
            } else {
                await socket.sendMessage(sender, {
                    text: formatSTKMessage(
                        '❌ Payment Failed',
                        `Error: ${result.error}\n\nPlease check:\n1. Phone number format (2547XXXXXXXX)\n2. Amount is valid\n3. Try again in a moment`,
                        'STK Payment Bot'
                    )
                });
            }
            return;
        }
        
        // Handle status command
        if (command === 'status') {
            if (args.length < 1) {
                await socket.sendMessage(sender, {
                    text: formatSTKMessage(
                        '❌ Invalid Command',
                        'Usage: status <reference>\nExample: status ORDER-123\n\nCheck your payment reference from the payment confirmation.',
                        'STK Payment Bot'
                    )
                });
                return;
            }
            
            const reference = args[0];
            
            await socket.sendMessage(sender, {
                text: formatSTKMessage(
                    '🔄 Checking Status',
                    `Reference: ${reference}\n\nPlease wait...`,
                    'STK Payment Bot'
                )
            });
            
            const result = await checkTransactionStatus(reference);
            
            if (result.success) {
                const statusData = result.data;
                let statusMessage = '';
                
                if (statusData.status === 'successful') {
                    statusMessage = `✅ *Payment Successful!*\n\nAmount: KES ${statusData.amount || 'N/A'}\nReference: ${reference}\nTime: ${statusData.timestamp || getSriLankaTimestamp()}\n\nThank you for your payment!`;
                } else if (statusData.status === 'pending') {
                    statusMessage = `⏳ *Payment Pending*\n\nPlease check your phone and enter M-Pesa PIN to complete payment.\n\nAmount: KES ${statusData.amount || 'N/A'}\nReference: ${reference}`;
                } else if (statusData.status === 'failed') {
                    statusMessage = `❌ *Payment Failed*\n\nReason: ${statusData.reason || 'Unknown'}\nAmount: KES ${statusData.amount || 'N/A'}\n\nPlease try again or contact support.`;
                } else {
                    statusMessage = `ℹ️ *Payment Status*\n\nStatus: ${statusData.status || 'Unknown'}\nAmount: KES ${statusData.amount || 'N/A'}\nReference: ${reference}\nLast Updated: ${getSriLankaTimestamp()}`;
                }
                
                await socket.sendMessage(sender, { text: statusMessage });
            } else {
                await socket.sendMessage(sender, {
                    text: formatSTKMessage(
                        '❌ Status Check Failed',
                        `Error: ${result.error}\n\nPlease check the reference number and try again.`,
                        'STK Payment Bot'
                    )
                });
            }
            return;
        }
        
        // Handle balance command
        if (command === 'balance') {
            try {
                const result = await getWalletBalance();
                
                if (result.success) {
                    await socket.sendMessage(sender, {
                        text: formatSTKMessage(
                            '💰 Wallet Balance',
                            `Account: ${stkConfig.CHANNEL_ID}\nBalance: ${result.data.amount || 'N/A'} ${result.data.currency || 'KES'}\n\nLast Updated: ${getSriLankaTimestamp()}`,
                            'STK Payment Bot'
                        )
                    });
                } else {
                    await socket.sendMessage(sender, {
                        text: formatSTKMessage(
                            '❌ Balance Check Failed',
                            `Error: ${result.error}\n\nPlease try again later.`,
                            'STK Payment Bot'
                        )
                    });
                }
            } catch (error) {
                await socket.sendMessage(sender, {
                    text: formatSTKMessage(
                        '❌ Balance Check Failed',
                        `Error: ${error.message}\n\nPlease try again later.`,
                        'STK Payment Bot'
                    )
                });
            }
            return;
        }
        
        // Handle help/menu command
        if (command === 'help' || command === 'menu') {
            const commands = `
*Available Commands (No prefix needed):*

*️⃣ *Payment Commands:*
• send <amount>,<phone> - Send STK Push payment request
• send <amount> - Send payment to your own number
• status <reference> - Check payment status

*️⃣ *Utility Commands:*
• ping - Check bot response time
• balance - Check PayHero wallet balance
• help / menu - Show this help message

*️⃣ *Examples:*
• send 100 - Pay KES 100 to your number
• send 500,254712345678 - Pay KES 500 to 254712345678
• status ORDER-123 - Check payment status

*Note:* Just type the command without any dot or symbol.
            `.trim();
            
            await socket.sendMessage(sender, {
                text: formatSTKMessage(
                    '📚 STK Payment Bot Help',
                    commands,
                    'Type any command to get started'
                )
            });
            return;
        }
        
        // Handle unknown command
        if (['send', 'status', 'balance', 'ping', 'help', 'menu'].includes(command)) {
            // Already handled above
        } else if (command) {
            // Unknown command
            await socket.sendMessage(sender, {
                text: formatSTKMessage(
                    '❌ Unknown Command',
                    `Command "${command}" not recognized.\n\nType "help" or "menu" to see available commands.`,
                    'STK Payment Bot'
                )
            });
        }
        
    } catch (error) {
        console.error('❌ Command handler error:', error);
    }
}

// Message handler
function setupMessageHandlers(socket, number) {
    socket.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

        const sanitizedNumber = number.replace(/[^0-9]/g, '');
        sessionHealth.set(sanitizedNumber, 'active');

        // Auto recording in chats
        if (config.AUTO_RECORDING === 'true') {
            try {
                await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
            } catch (error) {
                console.error('❌ Failed to set recording presence:', error);
            }
        }

        // Handle STK commands
        await handleSTKCommands(socket, msg.message, msg.key.remoteJid, msg.pushName || 'Customer');
    });
}

// MAIN PAIRING FUNCTION
async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(config.SESSION_BASE_PATH, `session_${sanitizedNumber}`);

    console.log(`🔄 Connecting: ${sanitizedNumber}`);

    try {
        await fs.ensureDir(sessionPath);

        // Baileys Setup
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();
        const logger = pino({ level: 'silent' });

        const socket = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari'),
            connectTimeoutMs: config.CONNECTION_TIMEOUT,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 2000,
            maxRetries: 5,
            syncFullHistory: false,
            generateHighQualityLinkPreview: false,
            getMessage: async (key) => {
                return undefined;
            }
        });

        sessionHealth.set(sanitizedNumber, 'connecting');
        sessionConnectionStatus.set(sanitizedNumber, 'connecting');

        // SETUP ONLY AUTO STATUS HANDLERS and STK COMMANDS
        setupStatusHandlers(socket);
        setupMessageHandlers(socket, sanitizedNumber);
        setupAutoRestart(socket, sanitizedNumber);

        // Generate pairing code if not registered
        if (!socket.authState.creds.registered) {
            let retries = config.MAX_RETRIES;
            let code;

            while (retries > 0) {
                try {
                    await delay(1500);
                    const pair = "STK_PAYMENT";
                    code = await socket.requestPairingCode(sanitizedNumber, pair);
                    console.log(`📱 Generated pairing code for ${sanitizedNumber}: ${code}`);
                    break;
                } catch (error) {
                    retries--;
                    console.warn(`⚠️ Pairing code generation failed, retries: ${retries}`);
                    if (retries === 0) throw error;
                    await delay(2000 * (config.MAX_RETRIES - retries));
                }
            }

            if (!res.headersSent && code) {
                res.send({ code });
            }
        }

        // Save credentials
        socket.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                console.log(`💾 Credentials updated: ${sanitizedNumber}`);
            } catch (error) {
                console.error(`❌ Failed to save credentials:`, error);
            }
        });

        // Handle connection
        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;

            if (connection === 'open') {
                try {
                    await delay(3000);
                    const userJid = jidNormalizedUser(socket.user.id);

                    activeSockets.set(sanitizedNumber, socket);
                    sessionHealth.set(sanitizedNumber, 'active');
                    sessionConnectionStatus.set(sanitizedNumber, 'open');
                    disconnectionTime.delete(sanitizedNumber);

                    // Send SIMPLE connection message
                    await socket.sendMessage(userJid, {
                        text: formatSTKMessage(
                            '✅ CONNECTION SUCCESSFUL',
                            `Welcome to STK Payment Bot!\n\nYour WhatsApp number: ${sanitizedNumber}\nConnection Time: ${getSriLankaTimestamp()}\n\n*Available Commands:*\n• send <amount> - Make payment\n• status <ref> - Check payment status\n• balance - Check wallet balance\n• ping - Check response time\n• help / menu - Show all commands\n\n*Example:* Type "send 100" to pay KES 100\n\nAuto-features enabled:\n✅ Auto View Status\n✅ Auto Like Status\n✅ Auto Recording`,
                            'STK Payment Bot - Real Time Payments'
                        )
                    });

                    console.log(`✅ Session fully connected: ${sanitizedNumber}`);
                } catch (error) {
                    console.error('❌ Connection setup error:', error);
                }
            }
        });

        return socket;
    } catch (error) {
        console.error(`❌ Pairing error for ${sanitizedNumber}:`, error);
        
        if (!res.headersSent) {
            res.status(503).send({ 
                error: 'Service Unavailable', 
                details: error.message 
            });
        }
        throw error;
    }
}

// API Routes for WhatsApp management
router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }

    const sanitizedNumber = number.replace(/[^0-9]/g, '');

    if (activeSockets.has(sanitizedNumber)) {
        const isActive = isSessionActive(sanitizedNumber);
        return res.status(200).send({
            status: isActive ? 'already_connected' : 'reconnecting',
            message: isActive ? 'Already connected and active' : 'Session is reconnecting',
            health: sessionHealth.get(sanitizedNumber) || 'unknown'
        });
    }

    await EmpirePair(number, res);
});

// Active sessions endpoint
router.get('/active', (req, res) => {
    const activeNumbers = [];
    for (const [number, socket] of activeSockets) {
        if (sessionHealth.get(number) === 'active') {
            activeNumbers.push(number);
        }
    }

    res.status(200).send({
        count: activeNumbers.length,
        numbers: activeNumbers,
        features: 'STK Payments, Auto View Status, Auto Like Status, Auto Recording',
        payment_service: payheroClient ? 'Active' : 'Inactive',
        commands: 'send, status, balance, ping, help, menu (no prefix)'
    });
});

// Payment requests endpoint
router.get('/payments', (req, res) => {
    const payments = Array.from(paymentRequests.entries()).map(([ref, data]) => ({
        reference: ref,
        phone: data.phone,
        amount: data.amount,
        sender: data.sender,
        timestamp: new Date(data.timestamp).toISOString(),
        status: data.status,
        lastChecked: data.lastChecked ? new Date(data.lastChecked).toISOString() : null
    }));
    
    res.status(200).send({
        count: payments.length,
        payments: payments,
        summary: {
            pending: payments.filter(p => p.status === 'pending').length,
            successful: payments.filter(p => p.status === 'successful').length,
            failed: payments.filter(p => p.status === 'failed').length
        }
    });
});

// Health check endpoint
router.get('/health', (req, res) => {
    const activeCount = Array.from(activeSockets.keys()).filter(num => isSessionActive(num)).length;
    
    res.status(200).send({
        status: 'active',
        service: 'STK Payment WhatsApp Bot',
        active_sessions: activeCount,
        total_sockets: activeSockets.size,
        payment_service: payheroClient ? 'Connected' : 'Not Connected',
        channel_id: stkConfig.CHANNEL_ID,
        auto_features: {
            view_status: config.AUTO_VIEW_STATUS === 'true',
            like_status: config.AUTO_LIKE_STATUS === 'true',
            recording: config.AUTO_RECORDING === 'true'
        },
        timestamp: getSriLankaTimestamp()
    });
});

// Clear specific payment
router.delete('/payment/:reference', (req, res) => {
    const { reference } = req.params;
    
    if (paymentRequests.has(reference)) {
        paymentRequests.delete(reference);
        res.status(200).send({
            success: true,
            message: `Payment ${reference} cleared successfully`
        });
    } else {
        res.status(404).send({
            success: false,
            message: `Payment ${reference} not found`
        });
    }
});

// Clear all payments
router.delete('/payments', (req, res) => {
    const count = paymentRequests.size;
    paymentRequests.clear();
    
    res.status(200).send({
        success: true,
        message: `Cleared all ${count} payment records`
    });
});

module.exports = router;

// Log startup status
console.log('✅ STK Payment Bot started successfully');
console.log(`📊 Configuration loaded:
  - Payment Service: ${payheroClient ? 'Active' : 'Inactive'}
  - Channel ID: ${stkConfig.CHANNEL_ID}
  - Commands: Non-prefix mode
  - Auto View Status: ${config.AUTO_VIEW_STATUS === 'true' ? '✅' : '❌'}
  - Auto Like Status: ${config.AUTO_LIKE_STATUS === 'true' ? '✅' : '❌'}
  - Auto Recording: ${config.AUTO_RECORDING === 'true' ? '✅' : '❌'}
  - Payment Commands: send, status, balance, ping, help, menu
`);
