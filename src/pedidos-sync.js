const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// Rota para buscar os pedidos sincronizados
router.get('/', async (req, res) => {
    const { carteiraOnly } = req.query;
    try {
        let query;
        if (carteiraOnly === 'true') {
            query = `
                SELECT 
                    p.sync_key, 
                    p.data,
                    p.updated_at,
                    f.data_fic,
                    f.pro_codigo_fic AS has_ficha
                FROM firebird_sync_emissoes p
                LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
                WHERE 
                    ((p.data->>'QUANTIDADE_PPR')::numeric - COALESCE((p.data->>'QUANTIDADE_FATURADA_PPR')::numeric, 0)) > 0 
                    AND (p.data->>'STATUS_PPR') <> 'C'
                ORDER BY 
                    (f.pro_codigo_fic IS NOT NULL) DESC,
                    f.data_fic DESC NULLS LAST,
                    p.updated_at DESC
                LIMIT 1500
            `;
        } else {
            query = `
                SELECT 
                    p.sync_key, 
                    p.data,
                    p.updated_at,
                    f.data_fic,
                    f.pro_codigo_fic AS has_ficha
                FROM firebird_sync_emissoes p
                LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
                ORDER BY 
                    (f.pro_codigo_fic IS NOT NULL) DESC,
                    f.data_fic DESC NULLS LAST,
                    p.updated_at DESC
                LIMIT 1500
            `;
        }

        const result = await pool.query(query);

        // Extrair o JSONB para o nível raiz para facilitar o frontend
        const pedidos = result.rows.map(row => ({
            ...row.data, // Espalha as propriedades do JSONB
            _sync_updated_at: row.updated_at, // Mantém metadata de sync
            _data_fic: row.data_fic, // Adiciona o campo de data da ficha técnica para ordenação
            _has_ficha: !!row.has_ficha // Boolean flag
        }));

        res.json(pedidos);
    } catch (error) {
        console.error('Erro ao buscar pedidos sincronizados:', error);
        res.status(500).json({ error: 'Erro interno ao buscar pedidos.' });
    }
});

// Rota para buscar o histórico de snapshots industriais (últimos 15 dias)
router.get('/industrial-history', async (req, res) => {
    try {
        const query = `
            SELECT 
                TO_CHAR(snapshot_date, 'YYYY-MM-DD') as date,
                aguardando_qty, aguardando_weight,
                moldagem_qty, moldagem_weight,
                fusao_qty, fusao_weight,
                acabamento_qty, acabamento_weight,
                tt_qty, tt_weight,
                usinagem_qty, usinagem_weight,
                qualidade_qty, qualidade_weight,
                expedicao_qty, expedicao_weight
            FROM industrial_snapshots
            WHERE snapshot_date >= DATE_TRUNC('month', CURRENT_DATE)
            ORDER BY snapshot_date ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Erro ao buscar histórico industrial:', error);
        res.status(500).json({ error: 'Erro interno ao buscar histórico.' });
    }
});

module.exports = router;
