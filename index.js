const express = require('express');
const path = require('path');
const app = express();
__path = process.cwd()
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 50900;
const { 
  qrRoute,
  pairRoute
} = require('./routes');
require('events').EventEmitter.defaultMaxListeners = 2000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Import WhatsApp manager
const { 
  getAllActiveSessions, 
  getActiveSessionCount,
  disconnectAllSessions 
} = require('./whatsapp-manager');

app.use('/qr', qrRoute);
app.use('/code', pairRoute);

app.get('/pair', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check with active sessions info
app.get('/health', (req, res) => {
    res.json({
        status: 200,
        success: true,
        service: 'Gifted-Md Session with STK Payments',
        timestamp: new Date().toISOString(),
        active_sessions: getActiveSessionCount(),
        payment_service: 'Integrated'
    });
});

// List all active sessions
app.get('/sessions', (req, res) => {
    const sessions = getAllActiveSessions();
    res.json({
        count: sessions.length,
        sessions: sessions
    });
});

// Disconnect all sessions
app.delete('/sessions', (req, res) => {
    disconnectAllSessions();
    res.json({
        success: true,
        message: 'All active sessions disconnected'
    });
});

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║      GIFTED SESSION SERVER WITH STK PAYMENTS      ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  ✅ Server running on http://localhost:${PORT}     ║
║  ✅ QR Code: http://localhost:${PORT}/qr          ║
║  ✅ Pair Code: http://localhost:${PORT}/pair      ║
║  ✅ Health: http://localhost:${PORT}/health       ║
║  ✅ Active Sessions: http://localhost:${PORT}/sessions ║
║                                                   ║
║  📱 Payment Commands Available:                   ║
║     • menu                                        ║
║     • send <amount>                               ║
║     • send <amount>,<phone>                       ║
║     • status <reference>                          ║
║     • balance                                     ║
║     • ping                                        ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
`);
});

module.exports = app;
