// src/refugos.js
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// --- ROTA GET: Carregar dados sincronizados ---
router.get('/', async (req, res) => {
    const client = await pool.connect();

    try {
        // Fetch synchronized scrap data
        const dados = await client.query(`
            SELECT 
                id, 
                setor, 
                to_char(data_refugo, 'YYYY-MM-DD') as data, 
                produto as descricao, 
                codigo_peca, 
                lote, 
                quantidade, 
                peso_un, 
                peso_total,
                op,
                motivo
            FROM refugo_apontado_sincronizado 
            ORDER BY data_refugo DESC
        `);

        // Fetch monthly production (manually entered or synced, reusing specific table if needed or new logic)
        // For now, let's reuse 'refugo_producao_mensal' if it exists, or create a new one if requested.
        // The prompt asked for visualization only from Firebird for scrap.
        // But for % calculation, we need total production.
        // Assuming we can use the existing 'refugo_producao_mensal' table for backwards compatibility or new one.
        // Let's try to fetch from 'refugo_producao_mensal' (legacy) or 'producao_apontada_sincronizada' (new sync).
        // Best approach: Calculate production from 'producao_apontada_sincronizada' which is already synced!

        let prodMap = {};

        // Option A: Use Synced Production (More accurate if sync is running)
        // Aggregating by Month-Year for 2025 and 2026
        // Using logic from producao-postgres.js to handle zero weights
        const producaoAgg = await client.query(`
            SELECT 
                to_char(t.data_producao, 'YYYY-MM') as mes_ano, 
                SUM(t.quantidade * COALESCE(NULLIF(t.peso_un, 0), p.peso, 0)) as total_peso
            FROM producao_apontada_sincronizada t
            LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
            WHERE t.data_producao >= '2025-01-01'
              AND t.setor = 'FUSAO'
            GROUP BY 1
        `);

        producaoAgg.rows.forEach(r => {
            prodMap[r.mes_ano] = parseFloat(r.total_peso);
        });

        return res.status(200).json({
            refugoRawData: dados.rows,
            refugoMonthlyProduction: prodMap
        });

    } catch (error) {
        console.error("Erro GET Refugos:", error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

module.exports = router;
