import pkg from '@whiskeysockets/baileys';
const { default: axios } = await import('axios');
const { writeFile } = await import('fs/promises');
const { tmpdir } = await import('os');
const { join } = await import('path');
const { proto } = pkg;
import config from '../../config.cjs';

const Song3Handler = async (m, Matrix) => {
  const body = m.body?.trim();
  if (!body?.toLowerCase().startsWith('song3')) return;

  const sender = m.sender;
  if (sender !== `${config.OWNER_NUMBER}@s.whatsapp.net`) return;

  const query = body.slice(6)?.trim();
  if (!query) return await m.reply('❌ Please provide a song name to search.');

  try {
    await m.React('⏳');

    // Step 1: Search on YouTube
    const ytSearch = await axios.get(`https://api.siputzx.my.id/api/search/youtube?query=${encodeURIComponent(query)}`);
    const topResult = ytSearch?.data?.result?.[0];

    if (!topResult?.url) {
      await m.reply('⚠️ No results found.');
      return;
    }

    const videoUrl = topResult.url;
    const title = topResult.title;
    const thumb = topResult.thumb;

    // Step 2: Download MP3
    const audioRes = await axios.get(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(videoUrl)}`);
    const audioLink = audioRes?.data?.result?.url;
    if (!audioLink) return await m.reply('⚠️ Couldn\'t fetch audio.');

    const audioBuffer = await axios.get(audioLink, { responseType: 'arraybuffer' });
    const tempPath = join(tmpdir(), `song3-${Date.now()}.mp3`);
    await writeFile(tempPath, audioBuffer.data);

    // Step 3: Send message + audio
    await Matrix.sendMessage(m.chat, {
      image: { url: thumb },
      caption: `🎶 *${title}*\n\n🔗 ${videoUrl}`
    }, { quoted: m });

    await Matrix.sendMessage(m.chat, {
      audio: { url: tempPath },
      mimetype: 'audio/mp4',
      ptt: false
    }, { quoted: m });

    await m.React('✅');
  } catch (err) {
    console.error('song3 error:', err);
    await m.reply('❌ Error downloading song.');
    await m.React('❌');
  }
};

export default Song3Handler;
