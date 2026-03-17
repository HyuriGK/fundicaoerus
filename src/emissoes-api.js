const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/emissoes/monthly-summary
router.get('/monthly-summary', async (req, res) => {
    try {
        const query = `
            SELECT 
                EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) as ano,
                EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) as mes,
                SUM(COALESCE(pc.peso * CAST(COALESCE(p.data->>'QUANTIDADE_PPR', '0') AS NUMERIC), CAST(COALESCE(p.data->>'PESO_LIQUIDO_NPR', '0') AS NUMERIC))) as total_peso,
                SUM(CAST(COALESCE(p.data->>'VALOR_PPR', '0') AS NUMERIC) * CAST(COALESCE(p.data->>'QUANTIDADE_PPR', '0') AS NUMERIC)) as total_valor
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            WHERE p.data->>'DATA_EMISSAO_PEDIDO' IS NOT NULL
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

// GET /api/emissoes/client-summary
router.get('/client-summary', async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano) {
            return res.status(400).json({ error: 'Ano é obrigatório.' });
        }

        let whereClause = "WHERE EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $1";
        const params = [ano];

        if (mes && mes !== 'Todos') {
            whereClause += " AND EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $2";
            params.push(mes);
        }

        const query = `
            SELECT 
                p.data->>'NOME_CLIENTE' as cliente,
                p.data->>'ID_CLIENTE_CORE' as id_cliente,
                SUM(COALESCE(pc.peso * CAST(COALESCE(p.data->>'QUANTIDADE_PPR', '0') AS NUMERIC), CAST(COALESCE(p.data->>'PESO_LIQUIDO_NPR', '0') AS NUMERIC))) as total_peso,
                SUM(CAST(COALESCE(p.data->>'VALOR_PPR', '0') AS NUMERIC) * CAST(COALESCE(p.data->>'QUANTIDADE_PPR', '0') AS NUMERIC)) as total_valor
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            ${whereClause}
            GROUP BY 1, 2
            ORDER BY 3 DESC
        `;

        const result = await pool.query(query, params);

        const formatted = result.rows.map(row => ({
            id: row.id_cliente,
            name: row.cliente,
            totalPeso: parseFloat(row.total_peso),
            totalValor: parseFloat(row.total_valor)
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Erro ao buscar resumo de clientes:', error);
        res.status(500).json({ error: 'Erro interno ao processar resumo de clientes.' });
    }
});

// GET /api/emissoes/list
router.get('/list', async (req, res) => {
    try {
        const { ano, mes } = req.query;
        if (!ano) {
            return res.status(400).json({ error: 'Ano é obrigatório.' });
        }

        let whereClause = "WHERE EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $1";
        const params = [ano];

        if (mes && mes !== 'Todos') {
            whereClause += " AND EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = $2";
            params.push(mes);
        }

        const query = `
            SELECT 
                p.data,
                pc.peso as peso_customizado
            FROM firebird_sync_emissoes p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            ${whereClause}
            ORDER BY (p.data->>'DATA_EMISSAO_PEDIDO')::date DESC
        `;

        const result = await pool.query(query, params);
        const records = result.rows.map(row => {
            const data = row.data;
            if (row.peso_customizado !== null) {
                // Return corrected weight in the data object
                data.PESO_LIQUIDO_NPR = row.peso_customizado * (parseFloat(data.QUANTIDADE_PPR) || 0);
                data.PESO_UNIT_ORIGINAL = data.PESO_UNIT; // Preserve original for debug if needed
                data.PESO_UNIT = row.peso_customizado;
            }
            return data;
        });

        res.json(records);
    } catch (error) {
        console.error('Erro ao listar registros de emissões:', error);
        res.status(500).json({ error: 'Erro interno ao listar registros.' });
    }
});

module.exports = router;

