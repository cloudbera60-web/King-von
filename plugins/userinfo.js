import config from '../../config.cjs';

const userInfo = async (m, sock) => {
    try {
        const body = m.body?.toLowerCase().trim();
        
        // Check for trigger words
        if (!["who is", "user info", "profile info", "get profile"].some(trigger => body?.includes(trigger))) {
            return;
        }

        await m.React('⏳'); // Loading reaction

        // Determine target user (mentioned, quoted, or sender)
        let mentionedUser = m.mentionedJid?.[0] || 
                          (m.quoted ? m.quoted.sender : m.sender);

        // Fetch user data
        const [status, profilePictureUrl] = await Promise.all([
            sock.fetchStatus(mentionedUser).catch(() => ({ status: '🚫 No bio available' })),
            sock.profilePictureUrl(mentionedUser, 'image')
                .catch(() => 'https://telegra.ph/file/33a640e28e74f99a48b1a.jpg')
        ]);

        // Format response
        const responseText = 
            `🔍 *User Information*\n\n` +
            `👤 *Name:* ${status?.name || 'Unknown User'}\n` +
            `🆔 *User ID:* ${mentionedUser.split('@')[0]}\n` +
            `📜 *Bio:* ${status?.status || '🚫 No bio available'}\n` +
            `📅 *Last Updated:* ${status?.lastSeen ? new Date(status.lastSeen).toLocaleString() : 'Unknown'}\n\n` +
            `_POWERED BY CORE AI_`;

        // Send rich message
        await sock.sendMessage(
            m.from,
            {
                text: responseText,
                contextInfo: {
                    mentionedJid: [mentionedUser],
                    externalAdReply: {
                        title: "👤 User Profile",
                        body: "Detailed user information",
                        thumbnailUrl: profilePictureUrl,
                        sourceUrl: 'https://github.com/PRO-DEVELOPER-1/CORE-AI',
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            },
            { quoted: m }
        );

        await m.React('✅'); // Success reaction

    } catch (error) {
        console.error("User Info Error:", error);
        await m.React('❌');
        await m.reply("⚠️ Failed to fetch user information. Please try again later.");
    }
};

export default userInfo;
