[file name]: index.js
[file content begin]
const express = require('express');
const app = express();
const __path = process.cwd();
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 8000;
const pairRouter = require('./pair');

// Increase event listeners
require('events').EventEmitter.defaultMaxListeners = 500;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/pair', pairRouter);
app.use('/code', pairRouter); // For compatibility with your existing frontend

// Serve main.html for both root and /pair-page
app.get('/', (req, res) => {
    res.sendFile(__path + '/main.html');
});

app.get('/pair-page', (req, res) => {
    res.redirect('/'); // Redirect to main page instead
});

// Start server
app.listen(PORT, () => {
    console.log(`
🚀 STK Payment WhatsApp Bot
Server running on port: ${PORT}
Payment Service: Ready
Commands: send, status, balance, ping, help (no prefix)
API Endpoints:
  GET /pair?number=... - Connect WhatsApp
  GET /pair/active - Active sessions
  GET /pair/payments - Payment requests
  GET /pair/health - Health check
    `);
});

module.exports = app;
[file content end]
