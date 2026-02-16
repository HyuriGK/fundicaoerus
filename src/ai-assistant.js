
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const geminiConfig = require('./gemini_config');

router.post('/chat', async (req, res) => {
    try {
        const userMessage = req.body.message;
        const apiKey = geminiConfig.GEMINI_API_KEY;

        console.log("Debugging Gemini Key:", apiKey ? "Presente" : "Ausente");

        if (!apiKey) {
            return res.status(500).json({ reply: "Erro: Chave de API do Gemini não configurada no arquivo de config." });
        }

        // 1. Aggregate Data from Database
        // Define all sectors to monitor
        const sectors = ['FUSAO', 'ACABAMENTO', 'EXPEDICAO', 'MOLDAGEM LEVE', 'MOLDAGEM MANUAL', 'MOLDAGEM PESADA'];

        // Execute all queries in parallel
        const [dailyProd, dailyBilling, scrapStats, extFinishingStats, ...sectorResults] = await Promise.all([
            getDailyProduction(),
            getDailyBilling(),
            getScrapStats(),
            getExternalFinishingStats(),
            ...sectors.map(s => getSectorStats(s)),
            getSectorStats('MOLDAGEM', true) // Special case for MOLDAGEM GERAL (Use LIKE %MOLDAGEM%)
        ]);

        // Map results back to specific variables for the prompt
        const sectorStats = {};
        sectors.forEach((s, i) => sectorStats[s] = sectorResults[i]);
        // The last result is MOLDAGEM GERAL
        const moldingGeneralStats = sectorResults[sectors.length];

        // Debug log to check fetched data
        console.log("AI Data Context:", { dailyProd, sectorStats, extFinishingStats });

        // 2. Construct System Prompt
        const systemPrompt = `
Você é uma IA assistente especializada para uma fábrica de fundição. 
Sabe tudo sobre os processos, dados e metas.

**OBJETIVO:** 
Fornecer ao gerente um resumo preciso e rápido da situação da fábrica.
Seus dados vêm diretamente do banco de dados em tempo real.

**DIRETRIZES:**
- Seja direto, conciso e profissional.
- Use **negrito** para destacar números críticos.
- Se o valor for 0 ou muito baixo, alerte.
- Responda apenas o que foi perguntado, mas pode dar um breve contexto se relevante.

---
**CONTEXTO DE DADOS (DASHBOARD):**

📅 **DATA ATUAL:** ${new Date().toLocaleDateString('pt-BR')}

🏭 **PRODUÇÃO POR SETOR (Hoje vs Mês Atual):**

*   **FUSAO (KPI Principal):**
    *   Hoje: **${sectorStats['FUSAO'].today} kg**
    *   Mês: **${sectorStats['FUSAO'].month} Ton**

*   **MOLDAGEM GERAL (Soma de todas):**
    *   Hoje: **${moldingGeneralStats.today} kg**
    *   Mês: **${moldingGeneralStats.month} Ton**
    *   *Detalhe:*
        *   Leve: ${sectorStats['MOLDAGEM LEVE'].month} Ton
        *   Manual: ${sectorStats['MOLDAGEM MANUAL'].month} Ton
        *   Pesada: ${sectorStats['MOLDAGEM PESADA'].month} Ton

*   **ACABAMENTO INTERNO:**
    *   Hoje: **${sectorStats['ACABAMENTO'].today} kg**
    *   Mês: **${sectorStats['ACABAMENTO'].month} Ton**

*   **EXPEDIÇÃO:**
    *   Hoje: **${sectorStats['EXPEDICAO'].today} kg**
    *   Mês: **${sectorStats['EXPEDICAO'].month} Ton**

🛠️ **ACABAMENTO EXTERNO (Terceirização - Mês):**
- Total Enviado: ${extFinishingStats.weight} kg
- Cargas: ${extFinishingStats.loads}

📊 **PRODUÇÃO GERAL (Todos os Setores - Hoje)**
- **Peso Total:** ${dailyProd.weight} kg
- **Quantidade:** ${dailyProd.qty} peças
- **Setores Ativos:** ${dailyProd.sectors}

💰 **FATURAMENTO (Hoje)**
- **Total:** R$ ${dailyBilling.value}
- **Peso:** ${dailyBilling.weight} kg
- **Ticket Médio:** R$ ${dailyBilling.ticket}

⚠️ **QUALIDADE (Refugo - 7 Dias)**
- **Total Refugado:** ${scrapStats.rate}
- **Top Motivos:** ${scrapStats.reasons}

---
**PERGUNTA DO USUÁRIO:**
${userMessage}
`;

        // 3. Call Gemini
        const genAI = new GoogleGenerativeAI(apiKey);
        // Using Gemini 3 Flash Preview as requested
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

// --- HELPER FUNCTIONS ---

async function getSectorStats(sectorName, isLike = false) {
    try {
        const operator = isLike ? 'LIKE' : '=';
        const value = isLike ? `%${sectorName}%` : sectorName;

        // TODAY
        const resToday = await pool.query(`
            SELECT SUM(peso_total) as weight
            FROM producao_apontada_sincronizada
            WHERE setor ${operator} $1 
            AND data_producao = CURRENT_DATE
        `, [value]);

        // MONTH
        const resMonth = await pool.query(`
            SELECT SUM(peso_total) as weight
            FROM producao_apontada_sincronizada
            WHERE setor ${operator} $1 
            AND to_char(data_producao, 'YYYY-MM') = to_char(CURRENT_DATE, 'YYYY-MM')
        `, [value]);

        const weightToday = parseFloat(resToday.rows[0].weight || 0);
        const weightMonth = parseFloat(resMonth.rows[0].weight || 0);

        return {
            today: weightToday.toFixed(2),
            month: (weightMonth / 1000).toFixed(2) // Returns in Tons for the KPI
        };
    } catch (e) {
        console.error(`Erro stats ${sectorName}:`, e);
        return { today: "0", month: "0" };
    }
}

async function getExternalFinishingStats() {
    try {
        // Source: acabamento_externo_registros (from acabamento-externo.js)
        const res = await pool.query(`
            SELECT 
                SUM(peso) as weight,
                COUNT(DISTINCT carga) as loads
            FROM acabamento_externo_registros
            WHERE to_char(data, 'YYYY-MM') = to_char(CURRENT_DATE, 'YYYY-MM')
        `);

        return {
            weight: parseFloat(res.rows[0].weight || 0).toFixed(2),
            loads: parseInt(res.rows[0].loads || 0)
        };
    } catch (e) {
        console.error("Erro getExternalFinishingStats:", e);
        return { weight: "0", loads: "0" };
    }
}

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
        const res = await pool.query(`
            SELECT SUM(peso_total) as weight
            FROM refugo_dados
            WHERE data >= CURRENT_DATE - INTERVAL '7 days'
        `);

        const totalRefugo = parseFloat(res.rows[0].weight || 0);

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
            rate: `${totalRefugo.toFixed(1)}kg (7d)`,
            reasons: reasons || 'Nenhum'
        };
    } catch (e) {
        console.error("Erro scrap stats", e);
        return { rate: "Erro", reasons: "Erro" };
    }
}

module.exports = router;
