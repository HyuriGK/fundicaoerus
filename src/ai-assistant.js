
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const geminiConfig = require('./gemini_config');

router.post('/chat', async (req, res) => {
    try {
        const userMessage = req.body.message;

        const apiKey = geminiConfig.GEMINI_API_KEY;

        // Debug logging
        console.log("Debugging Gemini Key:", apiKey ? "Presente" : "Ausente");

        if (!apiKey) {
            return res.status(500).json({ reply: "Erro: Chave de API do Gemini não configurada no arquivo de config." });
        }

        // 1. Aggregate Data from Database
        const [dailyProd, dailyBilling, scrapStats] = await Promise.all([
            getDailyProduction(),
            getDailyBilling(),
            getScrapStats()
        ]);

        // 2. Construct System Prompt
        const systemPrompt = `
Você é uma IA assistente especializada para uma fábrica de fundição. Sabe tudo sobre os processos, dados e metas.
Seu objetivo é ajudar o gerente a ter uma visão rápida e precisa da fábrica.
Responda de forma concisa, direta e profissional, mas com um tom prestativo.
Use formatação Markdown para destacar números importantes.

**DADOS ATUAIS DA FÁBRICA (Hoje: ${new Date().toLocaleDateString('pt-BR')}):**

**Produção Hoje:**
- Peso Total: ${dailyProd.weight} kg
- Quantidade: ${dailyProd.qty} peças
- Principais Setores: ${dailyProd.sectors}

**Faturamento Hoje:**
- Valor Total: R$ ${dailyBilling.value}
- Peso Faturado: ${dailyBilling.weight} kg
- Ticket Médio: R$ ${dailyBilling.ticket}

**Qualidade (Refugo - Últimos 7 dias):**
- Taxa de Refugo: ${scrapStats.rate}%
- Principais Motivos: ${scrapStats.reasons}

**Pergunta do Usuário:** ${userMessage}
        `;

        // 3. Call Gemini API
        // Re-initialize to ensure key is used
        const genAI = new GoogleGenerativeAI(apiKey);
        // User requested Gemini 3 Flash
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const result = await model.generateContent(systemPrompt);
        const response = await result.response;
        const text = response.text();

        res.json({ reply: text });

    } catch (error) {
        console.error("Erro na IA:", error);
        res.status(500).json({ reply: "Desculpe, tive um problema ao processar sua solicitação: " + error.message });
    }
});

// Helper Functions for Data Aggregation
async function getDailyProduction() {
    try {
        const res = await pool.query(`
            SELECT 
                SUM(peso_total) as weight,
                SUM(quantidade) as qty,
                STRING_AGG(DISTINCT setor, ', ') as sectors
            FROM producao_apontada_sincronizada
            WHERE data_producao = CURRENT_DATE
        `);
        return {
            weight: parseFloat(res.rows[0].weight || 0).toFixed(2),
            qty: parseFloat(res.rows[0].qty || 0),
            sectors: res.rows[0].sectors || 'Nenhum apontamento'
        };
    } catch (e) {
        console.error("Erro production stats", e);
        return { weight: 0, qty: 0, sectors: 'Erro' };
    }
}

async function getDailyBilling() {
    try {
        const res = await pool.query(`
            SELECT total_notas, valor_total, peso_total 
            FROM faturamento_diario 
            WHERE data = CURRENT_DATE 
        `);

        if (res.rows.length === 0) return { value: "0,00", weight: "0", ticket: "0,00" };

        const row = res.rows[0];
        const val = parseFloat(row.valor_total || 0);
        const count = parseInt(row.total_notas || 1);

        return {
            value: val.toFixed(2),
            weight: parseFloat(row.peso_total || 0).toFixed(2),
            ticket: (val / count).toFixed(2)
        };
    } catch (e) {
        console.error("Erro billing stats", e);
        return { value: "0,00", weight: "0", ticket: "0,00" };
    }
}

async function getScrapStats() {
    try {
        // Get scrap for the last 7 days from refugo_dados
        const res = await pool.query(`
            SELECT 
                SUM(peso_total) as weight
            FROM refugo_dados
            WHERE data >= CURRENT_DATE - INTERVAL '7 days'
        `);

        const totalRefugo = parseFloat(res.rows[0].weight || 0);

        // Get top reasons
        const resReasons = await pool.query(`
            SELECT motivo, SUM(peso_total) as weight
            FROM refugo_dados
            WHERE data >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY motivo
            ORDER BY weight DESC
            LIMIT 3
        `);

        const reasons = resReasons.rows.map(r => `${r.motivo} (${parseFloat(r.weight).toFixed(1)}kg)`).join(', ');

        return {
            rate: `${totalRefugo.toFixed(1)}kg (Total 7 dias)`,
            reasons: reasons || 'Nenhum registro recente'
        };
    } catch (e) {
        console.error("Erro scrap stats", e);
        return { rate: "Erro", reasons: "Erro ao buscar dados" };
    }
}

module.exports = router;
