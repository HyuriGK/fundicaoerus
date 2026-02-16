
const { GoogleGenerativeAI } = require('@google/generative-ai');
const geminiConfig = require('./src/gemini_config');

async function listModels() {
    const genAI = new GoogleGenerativeAI(geminiConfig.GEMINI_API_KEY);
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" }); // Dummy init to get client
        // Actually the SDK doesn't have a direct listModels method on the client instance easily accessible in all versions.
        // But usually we can try to just run a generation with a fallback or check docs.
        // Wait, the error message itself suggested: "Call ListModels to see the list..."
        // valid method is likely absent in this high-level SDK wrapper or I need to import it differently.

        // Let's try a direct REST call if SDK fails, but SDK might have it.
        // Checking known working models: gemini-pro, gemini-1.5-flash, gemini-1.5-pro, gemini-1.0-pro

        // Let's force a simple test with gemini-1.5-flash-001
        console.log("Testing gemini-1.5-flash-001...");
        const modelFlash = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });
        const result = await modelFlash.generateContent("Test");
        console.log("Success with gemini-1.5-flash-001");
    } catch (e) {
        console.error("Error with 001:", e.message);
    }

    try {
        console.log("Testing gemini-pro...");
        const modelPro = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await modelPro.generateContent("Test");
        console.log("Success with gemini-pro");
    } catch (e) {
        console.error("Error with pro:", e.message);
    }
}

listModels();
