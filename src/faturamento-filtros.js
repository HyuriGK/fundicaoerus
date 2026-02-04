// src/faturamento-filtros.js
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/faturamento-filtros - Buscar clientes ocultos
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT cliente_codigo, cliente_nome, criado_em
            FROM faturamento_clientes_ocultos
            ORDER BY cliente_nome
        `);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('❌ Erro ao buscar filtros:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar filtros',
            error: error.message
        });
    }
});

// GET /api/faturamento-filtros/clientes - Listar todos os clientes únicos
router.get('/clientes', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT 
                cliente_codigo, 
                cliente_nome
            FROM faturamento_firebird
            WHERE cliente_nome IS NOT NULL
            ORDER BY cliente_nome
        `);

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('❌ Erro ao buscar clientes:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar clientes',
            error: error.message
        });
    }
});

// POST /api/faturamento-filtros - Adicionar cliente aos ocultos
router.post('/', async (req, res) => {
    try {
        const { cliente_codigo, cliente_nome } = req.body;

        if (!cliente_codigo || !cliente_nome) {
            return res.status(400).json({
                success: false,
                message: 'cliente_codigo e cliente_nome são obrigatórios'
            });
        }

        await pool.query(`
            INSERT INTO faturamento_clientes_ocultos (cliente_codigo, cliente_nome)
            VALUES ($1, $2)
            ON CONFLICT (cliente_codigo) DO NOTHING
        `, [cliente_codigo, cliente_nome]);

        res.json({
            success: true,
            message: 'Cliente adicionado aos ocultos'
        });
    } catch (error) {
        console.error('❌ Erro ao adicionar filtro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao adicionar filtro',
            error: error.message
        });
    }
});

// DELETE /api/faturamento-filtros/:codigo - Remover cliente dos ocultos
router.delete('/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;

        await pool.query(`
            DELETE FROM faturamento_clientes_ocultos
            WHERE cliente_codigo = $1
        `, [codigo]);

        res.json({
            success: true,
            message: 'Cliente removido dos ocultos'
        });
    } catch (error) {
        console.error('❌ Erro ao remover filtro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao remover filtro',
            error: error.message
        });
    }
});

module.exports = router;
