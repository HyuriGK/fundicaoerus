
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
// const { GoogleGenerativeAI } = require('@google/generative-ai'); // REMOVED
const deepseekConfig = require('./deepseek_config');

router.post('/chat', async (req, res) => {
    try {
        const userMessage = req.body.message;
        const apiKey = deepseekConfig.DEEPSEEK_API_KEY;

        console.log("Debugging DeepSeek Key:", apiKey ? "Presente" : "Ausente");

        if (!apiKey) {
            return res.status(500).json({ reply: "Erro: Chave de API do DeepSeek não configurada." });
        }

        // 1. Aggregate Data from Database
        // Define all sectors to monitor
        const sectors = ['FUSAO', 'ACABAMENTO', 'EXPEDICAO', 'MOLDAGEM LEVE', 'MOLDAGEM MANUAL', 'MOLDAGEM PESADA'];

        // Execute all queries in parallel
        const [dailyProd, dailyBilling, billingHistory, scrapStats, extFinishingStats, ...sectorResults] = await Promise.all([
            getDailyProduction(),
            getDailyBilling(),
            getBillingHistory(),
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
- Se o usuário pedir "faturamento dos últimos X dias", some os valores do histórico fornecido.
- Responda apenas o que foi perguntado.

---
**CONTEXTO DE DADOS (DASHBOARD):**

📅 **DATA ATUAL:** ${new Date().toLocaleDateString('pt-BR')}

🏭 **PRODUÇÃO POR SETOR (Hoje vs Mês):**

*   **FUSAO:**
    *   Hoje: **${sectorStats['FUSAO'].today} kg**
    *   Mês: **${sectorStats['FUSAO'].month} Ton**

*   **MOLDAGEM GERAL:**
    *   Hoje: **${moldingGeneralStats.today} kg**
    *   Mês: **${moldingGeneralStats.month} Ton**
    *   *Detalhamento:*
        *   **Leve:** Hoje ${sectorStats['MOLDAGEM LEVE'].today} kg / Mês ${sectorStats['MOLDAGEM LEVE'].month} Ton
        *   **Manual:** Hoje ${sectorStats['MOLDAGEM MANUAL'].today} kg / Mês ${sectorStats['MOLDAGEM MANUAL'].month} Ton
        *   **Pesada:** Hoje ${sectorStats['MOLDAGEM PESADA'].today} kg / Mês ${sectorStats['MOLDAGEM PESADA'].month} Ton

*   **ACABAMENTO INTERNO:**
    *   Hoje: **${sectorStats['ACABAMENTO'].today} kg**
    *   Mês: **${sectorStats['ACABAMENTO'].month} Ton**

*   **EXPEDIÇÃO:**
    *   Hoje: **${sectorStats['EXPEDICAO'].today} kg**
    *   Mês: **${sectorStats['EXPEDICAO'].month} Ton**

🛠️ **ACABAMENTO EXTERNO (Mês):**
- Total: ${extFinishingStats.weight} kg (${extFinishingStats.loads} Cargas)

💰 **FATURAMENTO (Hoje):**
- Total: R$ ${dailyBilling.value} (${dailyBilling.weight} kg)
- Ticket Médio: R$ ${dailyBilling.ticket}

📅 **HISTÓRICO RECENTE DE FATURAMENTO (Para cálculos):**
${billingHistory}

⚠️ **QUALIDADE (Refugo 7 Dias):**
- Taxa: ${scrapStats.rate}
- Motivos: ${scrapStats.reasons}

---
**PERGUNTA DO USUÁRIO:**
${userMessage}
`;

        // 3. Call DeepSeek API
        const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                stream: false
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`DeepSeek API Error: ${response.status} - ${errorData}`);
        }

        const data = await response.json();
        const text = data.choices[0].message.content;

        res.json({ reply: text });

    } catch (error) {
        console.error("Erro na IA:", error);
        res.status(500).json({ reply: "Desculpe, tive um problema ao processar sua solicitação: " + error.message });
    }
});

// --- HELPER FUNCTIONS ---

async function getBillingHistory() {
    try {
        const res = await pool.query(`
            SELECT 
                to_char(data, 'DD/MM') as day,
                valor_total,
                peso_total
            FROM faturamento_diario
            WHERE data >= CURRENT_DATE - INTERVAL '14 days'
            ORDER BY data DESC
        `);

        if (res.rows.length === 0) return "Sem histórico recente.";

        return res.rows.map(r =>
            `- ${r.day}: R$ ${parseFloat(r.valor_total).toFixed(2)} (${parseFloat(r.peso_total).toFixed(2)} kg)`
        ).join('\n');
    } catch (e) {
        console.error("Erro billing history:", e);
        return "Erro ao buscar histórico.";
    }
}

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
        // 1. Fetch Excluded Clients
        const resPrefs = await pool.query("SELECT value FROM app_preferences WHERE key = 'excluded_clients'");
        const excludedClients = new Set(resPrefs.rows.length > 0 ? resPrefs.rows[0].value : []);

        // 2. Fetch Daily Data (Detail Level) matching Logic in faturamento-postgres.js
        // We join with preferences to respect manual exclusions
        const res = await pool.query(`
            SELECT 
                f.cliente_nome,
                f.valor_unitario,
                f.quantidade,
                f.peso_total,
                f.nota_fiscal,
                COALESCE(p.excluido, f.excluido_manualmente, false) as is_excluded_manual
            FROM faturamento_firebird f
            LEFT JOIN faturamento_firebird_preferencias p 
                ON p.nota_fiscal = f.nota_fiscal
                AND p.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                AND COALESCE(p.pedido, '') = COALESCE(TRIM(f.pedido), '')
                AND p.data_faturamento = f.data_faturamento
                AND p.quantidade = f.quantidade
            WHERE f.data_faturamento = CURRENT_DATE
        `);

        let totalValue = 0;
        let totalWeight = 0;
        const uniqueNotes = new Set();

        res.rows.forEach(row => {
            const cliente = (row.cliente_nome || 'Desconhecido').trim();

            // Filter 1: Client Exclusion
            if (excludedClients.has(cliente)) return;

            // Filter 2: Manual Exclusion
            if (row.is_excluded_manual) return;

            // Calculation Logic from faturamentos.html: calculateCalculatedTotal
            // Formula: valorUnitario * quantidade * 100
            const valUnit = parseFloat(row.valor_unitario || 0);
            const qty = parseFloat(row.quantidade || 0);
            const itemTotal = valUnit * qty * 100;

            totalValue += itemTotal;
            totalWeight += parseFloat(row.peso_total || 0);
            uniqueNotes.add(row.nota_fiscal);
        });

        const count = uniqueNotes.size || 1;

        return {
            value: totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            weight: totalWeight.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            ticket: (count > 0 ? totalValue / count : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        };

    } catch (e) {
        console.error("Erro billing stats correction", e);
        return { value: "0,00", weight: "0,00", ticket: "0,00" };
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
