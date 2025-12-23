const express = require('express');
const path = require('path');
const app = express();
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

// API Routes
app.use('/qr', qrRoute);
app.use('/code', pairRoute);

// Page Routes
app.get('/pair', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pair.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 200,
        success: true,
        service: 'Gifted-MD Session Generator',
        timestamp: new Date().toISOString(),
        endpoints: {
            qr: '/qr',
            pair: '/pair',
            api_pair: '/code?number=PHONE_NUMBER'
        }
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║         🚀 GIFTED-MD SESSION SERVER             ║
╚══════════════════════════════════════════════════╝

✅ Deployment Successful!
🌐 Server running on: http://localhost:${PORT}
📱 QR Code: http://localhost:${PORT}/qr
🔗 Pair Code: http://localhost:${PORT}/pair
📊 Health: http://localhost:${PORT}/health

💡 Bot will auto-start after successful connection!
    `);
});

module.exports = app;
