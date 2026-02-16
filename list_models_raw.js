
const https = require('https');
const geminiConfig = require('./src/gemini_config');

const apiKey = geminiConfig.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

https.get(url, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.error) {
                console.error("API Error:", json.error);
            } else {
                console.log("Available Models:");
                json.models.forEach(m => console.log(`- ${m.name} (${m.supportedGenerationMethods.join(', ')})`));
            }
        } catch (e) {
            console.error("Parse Error", e);
            console.log("Raw Data:", data);
        }
    });

}).on('error', (err) => {
    console.error("Network Error:", err);
});
