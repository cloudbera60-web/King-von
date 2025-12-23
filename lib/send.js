export async function sendAudio(sock, jid, url, quoted) {
  await sock.sendMessage(jid, {
    audio: { url },
    mimetype: 'audio/mp4',
    ptt: true
  }, { quoted });
}
