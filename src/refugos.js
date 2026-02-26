// src/refugos.js
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// --- INIT MAPPING TABLE ---
(async () => {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS refugo_mapeamento_setores (
                motivo TEXT PRIMARY KEY,
                setor_responsavel TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Tabela 'refugo_mapeamento_setores' verificada.");
    } catch (e) {
        console.error("❌ Erro ao criar tabela refugo_mapeamento_setores:", e);
    } finally {
        client.release();
    }
})();

// --- ROTA GET: Carregar dados sincronizados com Mapeamento Manual ---
router.get('/', async (req, res) => {
    const client = await pool.connect();

    try {
        // Fetch synchronized scrap data JOINED with manual mapping
        const dados = await client.query(`
            SELECT 
                r.id, 
                r.setor, 
                to_char(r.data_refugo, 'YYYY-MM-DD') as data, 
                r.produto as descricao, 
                r.codigo_peca, 
                r.lote, 
                r.quantidade, 
                r.peso_un, 
                r.peso_total,
                r.op,
                r.motivo,
                r.cliente,
                m.setor_responsavel
            FROM refugo_apontado_sincronizado r
            LEFT JOIN refugo_mapeamento_setores m ON r.motivo = m.motivo
            ORDER BY r.data_refugo DESC
        `);

        let prodMap = {};

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

// --- ROTA GET: Listar Motivos Únicos ---
router.get('/motivos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT motivo 
            FROM refugo_apontado_sincronizado 
            WHERE motivo IS NOT NULL 
            ORDER BY motivo ASC
        `);
        res.json(result.rows.map(r => r.motivo));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ROTA GET: Obter Mapeamento Atual ---
router.get('/mapping', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM refugo_mapeamento_setores');
        res.json(result.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ROTA POST: Salvar Mapeamento ---
router.post('/mapping', async (req, res) => {
    const { motivo, setor_responsavel } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo obrigatório' });

    try {
        await pool.query(`
            INSERT INTO refugo_mapeamento_setores (motivo, setor_responsavel)
            VALUES ($1, $2)
            ON CONFLICT (motivo) DO UPDATE SET
                setor_responsavel = EXCLUDED.setor_responsavel,
                updated_at = CURRENT_TIMESTAMP
        `, [motivo, setor_responsavel]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
