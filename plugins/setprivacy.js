import { WA_DEFAULT_EPHEMERAL } from '@whiskeysockets/baileys';
import { privacyUtils } from '@shizodevs/shizoweb';

const privacyHandler = async (m, sock) => {
  const triggers = ['privacy', 'setpriv'];
  if (!triggers.some(t => m.text.startsWith(t))) return;

  try {
    const [, type, value] = m.text.split(' ');
    
    // Supported privacy types
    const privacyMap = {
      lastseen: ['all', 'contacts', 'none'],
      profile: ['all', 'contacts', 'none'],
      status: ['all', 'contacts', 'none'],
      groupadd: ['all', 'contacts', 'none'],
      disappear: [WA_DEFAULT_EPHEMERAL, 86400, 604800] // 24h, 7d
    };

    if (!type || !privacyMap[type]) {
      return sock.sendMessage(m.from, {
        text: `📛 Invalid type! Available:\n${Object.keys(privacyMap).join('\n')}`
      }, { quoted: m });
    }

    // Use ShizoWeb for advanced controls
    if (type === 'disappear') {
      await privacyUtils.setDisappearingMode(sock, value);
    } else {
      await sock.updatePrivacySettings(type, value);
    }

    await sock.sendMessage(m.from, {
      text: `✅ Privacy updated!\nType: ${type}\nValue: ${value}`
    }, { quoted: m });

  } catch (error) {
    console.error('Privacy error:', error);
    await sock.sendMessage(m.from, {
      text: '❌ Failed to update privacy. Check console for details.'
    }, { quoted: m });
  }
};

export default privacyHandler;
