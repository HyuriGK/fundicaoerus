const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/emissoes/monthly-summary
router.get('/monthly-summary', async (req, res) => {
    try {
        const query = `
            SELECT 
                EXTRACT(YEAR FROM (data->>'DATA_EMISSAO_PEDIDO')::date) as ano,
                EXTRACT(MONTH FROM (data->>'DATA_EMISSAO_PEDIDO')::date) as mes,
                SUM(CAST(COALESCE(data->>'PESO_LIQUIDO_NPR', '0') AS NUMERIC)) as total_peso,
                SUM(CAST(COALESCE(data->>'VALOR_PPR', '0') AS NUMERIC) * CAST(COALESCE(data->>'QUANTIDADE_PPR', '0') AS NUMERIC)) as total_valor
            FROM firebird_sync_emissoes
            WHERE data->>'DATA_EMISSAO_PEDIDO' IS NOT NULL
            GROUP BY 1, 2
            ORDER BY 1 DESC, 2 DESC
        `;

        const result = await pool.query(query);

        const formatted = result.rows.map(row => ({
            ano: parseInt(row.ano),
            mes: parseInt(row.mes),
            totalPeso: parseFloat(row.total_peso),
            totalValor: parseFloat(row.total_valor)
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Erro ao buscar resumo de emissões:', error);
        res.status(500).json({ error: 'Erro interno ao processar dados de emissões.' });
    }
});

// GET /api/emissoes/list
router.get('/list', async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano || !mes) {
            return res.status(400).json({ error: 'Ano e Mês são obrigatórios.' });
        }

        const query = `
            SELECT data
            FROM firebird_sync_emissoes
            WHERE EXTRACT(YEAR FROM (data->>'DATA_EMISSAO_PEDIDO')::date) = $1
              AND EXTRACT(MONTH FROM (data->>'DATA_EMISSAO_PEDIDO')::date) = $2
            ORDER BY (data->>'DATA_EMISSAO_PEDIDO')::date DESC
        `;

        const result = await pool.query(query, [ano, mes]);
        const records = result.rows.map(row => row.data);

        res.json(records);
    } catch (error) {
        console.error('Erro ao listar registros de emissões:', error);
        res.status(500).json({ error: 'Erro interno ao listar registros.' });
    }
});

module.exports = router;

