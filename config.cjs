// File: config.cjs (in same directory as your plugins folder)
module.exports = {
    // Copy ALL your config from config.js but as CommonJS
    SESSION_ID: process.env.SESSION_ID || "",
    PREFIX: process.env.PREFIX || '.',
    AUTO_STATUS_SEEN: process.env.AUTO_STATUS_SEEN !== undefined ? process.env.AUTO_STATUS_SEEN === 'true' : true,
    AUTO_STATUS_REACT: process.env.AUTO_STATUS_REACT || "true",
    // ... ALL other config properties
    OWNER_NUMBER: process.env.OWNER_NUMBER || "254743982206",
    BOT_NAME: process.env.BOT_NAME || "CLOUD ☁️ AI"
};
