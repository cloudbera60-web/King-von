import moment from 'moment-timezone';
import fs from 'fs';
import os from 'os';
import pkg from '@whiskeysockets/baileys';
const { generateWAMessageFromContent, proto } = pkg;
import config from '../config.cjs';
import axios from 'axios';

const getUserStats = async (user) => {
    return { menuCount: 5 };
};

const menu = async (m, Matrix) => {
    const cmd = m.body.toLowerCase().trim();
    if (cmd !== 'menu' && !/^[1-9]$|^10$/.test(cmd)) return;

    const currentTime = moment().format('HH');
    let greeting = "Good Day";
    if (currentTime < 12) greeting = "Good Morning";
    else if (currentTime < 18) greeting = "Good Afternoon";
    else greeting = "Good Evening";

    const lastUpdated = moment().format('LLLL');
    const userStats = await getUserStats(m.sender);

    const mainMenu = `
✨ Welcome to CLOUD ☁️ AI, ${m.pushName}! ✨

🖐️ ${greeting}, ${m.pushName}! 🎉 Bot is ready to assist you!

🕒 Last Updated: ${lastUpdated}
💻 User Stats: You've used this bot ${userStats.menuCount} times today!

🎯 Choose an option below to proceed:

📥 1. DOWNLOAD MENU
📱 2. CONVERTER MENU
🤖 3. AI MENU
🛠️ 4. TOOLS MENU
👥 5. GROUP MENU
🔍 6. SEARCH MENU
🏠 7. MAIN MENU
🧑‍💻 8. OWNER MENU
🕵️‍♂️ 9. STALK MENU
🎨 10. LOGO MENU

✏️ Please reply with a number (1–10) to open the submenu of your choice.`;

    const menuImageUrl = 'https://files.catbox.moe/7jt69h.jpg';

    if (cmd === 'menu') {
        await Matrix.sendMessage(m.from, {
            image: { url: menuImageUrl },
            caption: mainMenu,
            contextInfo: { mentionedJid: [m.sender] }
        }, { quoted: m });
        return;
    }

    const menus = {
        "1": `
🔽 DOWNLOAD MENU 🔽
• apk
• play
• video
• song
• mediafire
• pinterestdl
• insta
• ytmp3
• ytmp4`,

        "2": `
🔽 CONVERTER MENU 🔽
• attp
• ebinary
• dbinary
• emojimix
• mp3
• url`,

        "3": `
🔽 AI MENU 🔽
• ai
• sheng on/off
• report
• deepseek on/off
• dalle
• gemini
• define`,

        "4": `
🔽 TOOLS MENU 🔽
• calculator
• tempmail
• checkmail
• elements
• tts
• emojimix
• shorten
• save`,

        "5": `
🔽 GROUP MENU 🔽
• groupinfo
• hidetag
• tagall
• setdesc
• open
• close
• add
• kick
• antilink on/off
• antibot on/off
• grouplink
• invite
• promote
• poll
• vcf`,

        "6": `
🔽 SEARCH MENU 🔽
• play
• yts
• imdb
• google
• pinterest
• wallpaper
• wikimedia
• lyrics
• bible
• biblebooks`,

        "7": `
🔽 MAIN MENU 🔽
• ping
• alive
• owner
• menu
• about
• repo`,

        "8": `
🔽 OWNER MENU 🔽
• join
• leave
• block
• unblock
• setppbot
• pp
• anticall
• alwaysonline
• autoread
• autotyping
• autorecording
• autoreact
• autobio
• view
• del
• antidelete on/off`,

        "9": `
🔽 STALK MENU 🔽
• truecaller
• instastalk
• githubstalk`,

        "10": `
🔽 LOGO MENU 🔽
• logo
• hacker
• blackpink
• glossysilver
• naruto
• digitalglitch
• pixelglitch
• star
• smoke
• bear
• neondevil
• screen
• nature
• dragonball
• frozenchristmas
• foilballoon
• colorfulpaint
• americanflag
• water
• underwater
• dragonfire
• bokeh
• snow
• sand3D
• pubg
• horror
• blood
• bulb
• graffiti
• thunder
• thunder1
• womensday
• valentine
• graffiti2
• queencard
• galaxy
• pentakill
• birthdayflower
• zodiac
• water3D
• textlight
• wall
• gold
• glow`
    };

    if (menus[cmd]) {
        Matrix.sendMessage(m.from, {
            text: menus[cmd],
            contextInfo: { mentionedJid: [m.sender] }
        });
    }
};

export default menu;
