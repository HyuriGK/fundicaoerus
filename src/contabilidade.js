const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

router.get('/notas-servico', async (req, res) => {
    const dataInicio = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dataInicio || '') ? req.query.dataInicio : new Date().toISOString().slice(0, 8) + '01';
    const dataFim = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dataFim || '') ? req.query.dataFim : new Date().toISOString().slice(0, 10);

    try {
        const { rows } = await pool.query(`
            SELECT
                data, cnpj, prestador, nota_fiscal, valor, cfop,
                centro_custo_codigo, centro_custo
            FROM notas_servico_firebird_sync
            WHERE data BETWEEN $1::date AND $2::date
            ORDER BY data DESC, nota_fiscal DESC
        `, [dataInicio, dataFim]);

        const notas = rows.map(row => ({
            data: row.data,
            cnpj: String(row.cnpj || '').trim(),
            prestador: String(row.prestador || '').trim(),
            notaFiscal: row.nota_fiscal,
            valor: Number(row.valor) || 0,
            cfop: row.cfop,
            centroCusto: [row.centro_custo_codigo, row.centro_custo].filter(Boolean).join(' - ') || 'Sem centro de custo'
        }));
        res.json({ success: true, dataInicio, dataFim, notas, total: notas.reduce((sum, nota) => sum + nota.valor, 0) });
    } catch (error) {
        console.error('[contabilidade/notas-servico]', error.message);
        res.status(500).json({ success: false, error: 'Não foi possível consultar as notas de serviço.' });
    }
});

module.exports = router;
