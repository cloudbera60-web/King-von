const pino = require("pino");
const path = require("path");
const fs = require("fs-extra");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion,
    delay
} = require("@whiskeysockets/baileys");

// Import payment handlers
const { 
    handleSTKCommands, 
    formatSTKMessage,
    getSriLankaTimestamp 
} = require('./payment-service');

class WhatsAppManager {
    constructor() {
        this.activeSessions = new Map();
        this.sessionData = new Map();
    }

    async createSession(sessionId, phoneNumber, sessionPath) {
        try {
            console.log(`🔄 Creating WhatsApp session for ${phoneNumber}...`);
            
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
            const { version } = await fetchLatestBaileysVersion();

            const socket = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS("Safari"),
                syncFullHistory: false,
                markOnlineOnConnect: true,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                emitOwnEvents: true
            });

            // Setup connection handler
            socket.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;
                
                if (connection === 'open') {
                    console.log(`✅ WhatsApp connected for ${phoneNumber}`);
                    
                    // Store session data
                    this.activeSessions.set(sessionId, {
                        socket,
                        phoneNumber,
                        connectedAt: Date.now(),
                        user: socket.user
                    });

                    // Send welcome message
                    await delay(3000);
                    try {
                        await socket.sendMessage(socket.user.id, {
                            text: formatSTKMessage(
                                '✅ WHATSAPP CONNECTED',
                                `Welcome to GIFTED Payment Bot!\n\nYour WhatsApp is now active for payment commands.\n\n*Available Commands:*\n• menu - Show all commands\n• send <amount> - Make payment\n• send <amount>,<phone> - Send to another number\n• status <ref> - Check payment status\n• balance - Check wallet balance\n• ping - Check response time\n\n*Examples:*\nType "send 100" to pay KES 100\nType "send 500,254712345678"\nType "menu" for full command list`,
                                'GIFTED Payment Bot - Active'
                            )
                        });
                        console.log(`📩 Welcome message sent to ${phoneNumber}`);
                    } catch (error) {
                        console.error('Welcome message error:', error);
                    }
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log(`⚠️ Connection closed for ${phoneNumber}, status: ${statusCode}`);
                    
                    // Remove from active sessions
                    this.activeSessions.delete(sessionId);
                    
                    // Auto-reconnect if not logged out
                    if (statusCode !== DisconnectReason.loggedOut) {
                        console.log(`🔄 Attempting to reconnect ${phoneNumber} in 10 seconds...`);
                        setTimeout(async () => {
                            if (fs.existsSync(sessionPath)) {
                                await this.createSession(sessionId, phoneNumber, sessionPath);
                            }
                        }, 10000);
                    }
                }
            });

            // Setup message handler
            socket.ev.on('messages.upsert', async ({ messages }) => {
                const msg = messages[0];
                if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

                console.log(`📩 Message from ${phoneNumber}:`, 
                    msg.message.conversation?.substring(0, 50) || 
                    msg.message.extendedTextMessage?.text?.substring(0, 50) || 
                    'Media/Other'
                );

                // Handle STK payment commands
                await handleSTKCommands(socket, msg.message, msg.key.remoteJid, msg.pushName || 'Customer');
            });

            // Save credentials when updated
            socket.ev.on('creds.update', saveCreds);

            // Periodic presence update to keep connection alive
            setInterval(() => {
                if (socket.user && this.activeSessions.has(sessionId)) {
                    socket.sendPresenceUpdate('available').catch(() => {});
                }
            }, 60000); // Every minute

            return { success: true, socket };
            
        } catch (error) {
            console.error(`❌ Failed to create session for ${phoneNumber}:`, error.message);
            return { success: false, error: error.message };
        }
    }

    getSession(sessionId) {
        return this.activeSessions.get(sessionId);
    }

    getAllActiveSessions() {
        const sessions = [];
        for (const [sessionId, data] of this.activeSessions) {
            sessions.push({
                sessionId,
                phoneNumber: data.phoneNumber,
                connectedAt: new Date(data.connectedAt).toISOString(),
                user: data.user?.id || 'Unknown',
                active: true
            });
        }
        return sessions;
    }

    getActiveSessionCount() {
        return this.activeSessions.size;
    }

    disconnectSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session && session.socket) {
            session.socket.ws.close();
            this.activeSessions.delete(sessionId);
            return true;
        }
        return false;
    }

    disconnectAllSessions() {
        for (const [sessionId, session] of this.activeSessions) {
            if (session.socket) {
                session.socket.ws.close();
            }
        }
        this.activeSessions.clear();
    }
}

// Create singleton instance
const whatsappManager = new WhatsAppManager();
module.exports = whatsappManager;
