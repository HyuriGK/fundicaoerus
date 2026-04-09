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
                FROM firebird_sync_pedidos p
                INNER JOIN (
                    -- Join by both Pedido and Produto to match exactly the items in the backlog
                    SELECT DISTINCT pedido, codigo FROM carteira
                ) c ON (p.data->>'CODIGO_PPR') = c.pedido AND (p.data->>'PRODUTO_PPR') = c.codigo
                LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
                -- Removed the OP_PCS filter to include orders not yet in production but in the backlog
                ORDER BY 
                    (f.pro_codigo_fic IS NOT NULL) DESC,
                    f.data_fic DESC NULLS LAST,
                    p.updated_at DESC
                LIMIT 1000
            `;
        } else {
            query = `
                SELECT 
                    p.sync_key, 
                    p.data,
                    p.updated_at,
                    f.data_fic,
                    f.pro_codigo_fic AS has_ficha
                FROM firebird_sync_pedidos p
                LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
                ORDER BY 
                    (f.pro_codigo_fic IS NOT NULL) DESC,
                    f.data_fic DESC NULLS LAST,
                    p.updated_at DESC
                LIMIT 1000
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

module.exports = router;
