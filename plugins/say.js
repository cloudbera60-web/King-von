import googleTTS from 'google-tts-api';
import { getArgs, isTrigger } from '../lib/utils.js'; // assumes you have a util to extract args and match triggers
import { sendAudio } from '../lib/send.js'; // your custom audio sending logic

export const triggers = ['say', 'dit', 'itta']; // add more as needed

export async function handler(message, zk) {
  const { body, from, quoted, isBot } = message;

  // Check if message is from the bot and matches a trigger exactly
  const trigger = triggers.find(t => isTrigger(body, t));
  if (!isBot || !trigger) return;

  const args = getArgs(body);
  if (!args.length) {
    await zk.sendMessage(from, { text: 'Insert a word.' }, { quoted });
    return;
  }

  const text = args.join(' ');
  const langMap = {
    say: 'en',
    dit: 'fr',
    itta: 'ja',
  };

  const lang = langMap[trigger] || 'en';

  const url = googleTTS.getAudioUrl(text, {
    lang,
    slow: false,
    host: 'https://translate.google.com',
  });

  await sendAudio(zk, from, url, quoted);
}
