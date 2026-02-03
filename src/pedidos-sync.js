const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// Rota para buscar os pedidos sincronizados
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                sync_key, 
                data,
                updated_at 
            FROM firebird_sync_pedidos 
            ORDER BY updated_at DESC
            LIMIT 1000
        `);

        // Extrair o JSONB para o nível raiz para facilitar o frontend
        const pedidos = result.rows.map(row => ({
            ...row.data, // Espalha as propriedades do JSONB
            _sync_updated_at: row.updated_at // Mantém metadata de sync
        }));

        res.json(pedidos);
    } catch (error) {
        console.error('Erro ao buscar pedidos sincronizados:', error);
        res.status(500).json({ error: 'Erro interno ao buscar pedidos.' });
    }
});

module.exports = router;
