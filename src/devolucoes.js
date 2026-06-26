// src/devolucoes.js
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/devolucoes - Lista de devoluções sincronizadas
router.get('/', async (req, res) => {
    try {
        const { limit = 5000, startDate, endDate } = req.query;

        let query = `
            SELECT 
                codigo_not,
                nota_fiscal,
                serie,
                item_nota,
                data_entrada,
                cliente_codigo,
                cliente_nome,
                codigo_item,
                descricao,
                quantidade,
                valor_unitario,
                valor_total,
                peso_un,
                peso_total,
                motivo,
                nota_original,
                serie_original,
                item_original,
                atualizado_em
            FROM firebird_sync_devolucoes
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (startDate) {
            query += ` AND data_entrada >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND data_entrada <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        query += ` ORDER BY data_entrada DESC, nota_fiscal DESC`;

        if (limit) {
            query += ` LIMIT $${paramIndex}`;
            params.push(parseInt(limit));
        }

        const result = await pool.query(query, params);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('❌ Erro na API de devoluções:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados de devoluções',
            error: error.message
        });
    }
});

module.exports = router;
