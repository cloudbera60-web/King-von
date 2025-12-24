import config from '../config.cjs';

const welcomeCommand = async (m, Matrix) => {
  const isGroup = m.from.endsWith('@g.us');
  const isAdmin = m.isGroup && m.isAdmin;
  const isOwner = [config.OWNER_NUMBER + '@s.whatsapp.net'].includes(m.sender);

  if (!global.welcome) global.welcome = {};
  if (!global.welcome[m.from]) global.welcome[m.from] = { 
    enabled: true, 
    text: 'Welcome @user to the group!' 
  };

  if (!isGroup) return;

  // Command handling
  if (m.body.startsWith('!welcome on')) {
    if (!isAdmin && !isOwner) {
      await Matrix.sendMessage(m.from, { text: '*Admin-only command!*' }, { quoted: m });
      return;
    }
    global.welcome[m.from].enabled = true;
    await Matrix.sendMessage(m.from, { text: '*👋 Welcome messages enabled*' }, { quoted: m });
  }
  else if (m.body.startsWith('!welcome off')) {
    if (!isAdmin && !isOwner) {
      await Matrix.sendMessage(m.from, { text: '*Admin-only command!*' }, { quoted: m });
      return;
    }
    global.welcome[m.from].enabled = false;
    await Matrix.sendMessage(m.from, { text: '*🚫 Welcome messages disabled*' }, { quoted: m });
  }
  else if (m.body.startsWith('!welcome ')) {
    if (!isAdmin && !isOwner) {
      await Matrix.sendMessage(m.from, { text: '*Admin-only command!*' }, { quoted: m });
      return;
    }
    const newText = m.body.replace('!welcome ', '');
    global.welcome[m.from].text = newText;
    await Matrix.sendMessage(m.from, { text: '*📝 Welcome message updated!*' }, { quoted: m });
  }

  // Auto-welcome
  if (m.type === 'groupNotification' && m.body.includes('added') && global.welcome[m.from].enabled) {
    const newMembers = m.messageStubParameters.map(jid => jid.split('@')[0]);
    const mentions = newMembers.map(member => ({
      tag: `@${member}`,
      mention: `${member}@s.whatsapp.net`
    }));
    
    await Matrix.sendMessage(m.from, {
      text: global.welcome[m.from].text.replace('@user', mentions.map(m => m.tag).join(', ')),
      mentions: mentions.map(m => m.mention)
    });
  }
};
export default welcomeCommand;
