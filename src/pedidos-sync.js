const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// Rota para buscar os pedidos sincronizados
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.sync_key, 
                p.data,
                p.updated_at,
                f.data_fic
            FROM firebird_sync_pedidos p
            LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
            ORDER BY 
                (f.pro_codigo_fic IS NOT NULL) DESC,
                f.data_fic DESC NULLS LAST,
                p.updated_at DESC
            LIMIT 1000
        `);

        // Extrair o JSONB para o nível raiz para facilitar o frontend
        const pedidos = result.rows.map(row => ({
            ...row.data, // Espalha as propriedades do JSONB
            _sync_updated_at: row.updated_at, // Mantém metadata de sync
            _data_fic: row.data_fic // Adiciona o campo de data da ficha técnica para ordenação
        }));

        res.json(pedidos);
    } catch (error) {
        console.error('Erro ao buscar pedidos sincronizados:', error);
        res.status(500).json({ error: 'Erro interno ao buscar pedidos.' });
    }
});

module.exports = router;
