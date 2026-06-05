const express = require('express');
const router = express.Router();
const pool = require('../lib/db'); // Use shared pool configuration
const { logActivity } = require('./lib/logger');

// GET /list - Retorna todos os pesos customizados
router.get('/list', async (req, res) => {
    try {
        const result = await pool.query('SELECT codigo, peso FROM pesos_customizados');
        const weights = {};
        result.rows.forEach(row => {
            weights[row.codigo] = Number(row.peso);
        });
        res.json(weights);
    } catch (err) {
        console.error('Erro ao listar pesos:', err);
        res.status(500).json({ error: 'Erro interno ao listar pesos' });
    }
});

// POST /save - Salva ou atualiza um peso
router.post('/save', async (req, res) => {
    const { codigo, peso, peso_anterior } = req.body;

    if (!codigo || peso === undefined) {
        return res.status(400).json({ error: 'Código e Peso são obrigatórios' });
    }

    try {
        // Valor anterior para auditoria: usa o informado pelo cliente (peso exibido) ou cai pro custom salvo
        const prev = await pool.query('SELECT peso FROM pesos_customizados WHERE codigo = $1', [String(codigo)]);
        const pesoAnterior = (peso_anterior !== undefined && peso_anterior !== null && peso_anterior !== '' && !isNaN(Number(peso_anterior)))
            ? Number(peso_anterior)
            : (prev.rows.length ? Number(prev.rows[0].peso) : null);

        await pool.query(`
            INSERT INTO pesos_customizados (codigo, peso)
            VALUES ($1, $2)
            ON CONFLICT (codigo)
            DO UPDATE SET peso = EXCLUDED.peso
        `, [String(codigo), Number(peso)]);

        logActivity(req.headers['x-user'] || 'Desconhecido', 'UPDATE_PESO', req.headers['x-page'] || 'pesos_customizados', {
            codigo: String(codigo),
            peso_anterior: pesoAnterior,
            peso_novo: Number(peso)
        });

        res.json({ success: true, message: 'Peso salvo com sucesso' });
    } catch (err) {
        console.error('Erro ao salvar peso:', err);
        res.status(500).json({ error: 'Erro interno ao salvar peso' });
    }
});

module.exports = router;
