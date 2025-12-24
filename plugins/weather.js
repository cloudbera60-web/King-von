import axios from 'axios';

const weatherPlugin = async (m, sock) => {
  const triggers = ['weather', 'forecast'];
  const match = triggers.find(trigger => m.body?.toLowerCase().startsWith(trigger));

  if (match) {
    const location = m.body.slice(match.length).trim();
    if (!location) return sock.sendMessage(m.from, { text: '☀️ Example: weather London' }, { quoted: m });

    try {
      const { data } = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${config.WEATHER_API_KEY}&units=metric`);
      await sock.sendMessage(m.from, {
        text: `🌤️ *Weather for ${data.name}:*
• Temperature: ${data.main.temp}°C
• Humidity: ${data.main.humidity}%
• Wind: ${data.wind.speed} km/h
• Conditions: ${data.weather[0].description}`
      }, { quoted: m });
    } catch {
      await sock.sendMessage(m.from, { text: '❌ Location not found!' }, { quoted: m });
    }
  }
};
export default weatherPlugin;
