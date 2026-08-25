const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

router.get('/notas-servico', async (req, res) => {
    const dataInicio = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dataInicio || '') ? req.query.dataInicio : new Date().toISOString().slice(0, 8) + '01';
    const dataFim = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dataFim || '') ? req.query.dataFim : new Date().toISOString().slice(0, 10);

    try {
        const { rows } = await pool.query(`
            SELECT
                data, cnpj, prestador, nota_fiscal, valor, cfop, icms, ipi, pis, cofins,
                centro_custo_codigo, centro_custo
            FROM notas_servico_firebird_sync
            WHERE data BETWEEN $1::date AND $2::date
              AND tipo_nota = '99'
            ORDER BY data DESC, nota_fiscal DESC
        `, [dataInicio, dataFim]);

        const notas = rows.map(row => ({
            data: row.data,
            cnpj: String(row.cnpj || '').trim(),
            prestador: String(row.prestador || '').trim(),
            notaFiscal: row.nota_fiscal,
            valor: Number(row.valor) || 0,
            cfop: row.cfop,
            icms: Number(row.icms) || 0,
            ipi: Number(row.ipi) || 0,
            pis: Number(row.pis) || 0,
            cofins: Number(row.cofins) || 0,
            centroCustoCodigo: row.centro_custo_codigo || '',
            centroCustoDescricao: row.centro_custo || 'Sem centro de custo'
        }));
        res.json({ success: true, dataInicio, dataFim, notas, total: notas.reduce((sum, nota) => sum + nota.valor, 0) });
    } catch (error) {
        console.error('[contabilidade/notas-servico]', error.message);
        res.status(500).json({ success: false, error: 'Não foi possível consultar as notas de serviço.' });
    }
});

router.get('/cte', async (req, res) => {
    const dataInicio = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dataInicio || '') ? req.query.dataInicio : new Date().toISOString().slice(0, 8) + '01';
    const dataFim = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dataFim || '') ? req.query.dataFim : new Date().toISOString().slice(0, 10);
    const cfops = ['135200', '135201', '135202', '235200', '235201', '235202'];

    try {
        const { rows } = await pool.query(`
            SELECT data, cnpj, prestador, nota_fiscal, valor, cfop, icms, ipi, pis, cofins, centro_custo_codigo, centro_custo
            FROM notas_servico_firebird_sync
            WHERE data BETWEEN $1::date AND $2::date
              AND tipo_nota = '57'
              AND cfop::text = ANY($3::text[])
            ORDER BY data DESC, nota_fiscal DESC
        `, [dataInicio, dataFim, cfops]);
        const notas = rows.map(row => ({
            data: row.data, cnpj: String(row.cnpj || '').trim(), prestador: String(row.prestador || '').trim(),
            notaFiscal: row.nota_fiscal, valor: Number(row.valor) || 0, cfop: row.cfop,
            icms: Number(row.icms) || 0, ipi: Number(row.ipi) || 0, pis: Number(row.pis) || 0, cofins: Number(row.cofins) || 0,
            centroCustoCodigo: row.centro_custo_codigo || '', centroCustoDescricao: row.centro_custo || 'Sem centro de custo'
        }));
        res.json({ success: true, dataInicio, dataFim, notas, total: notas.reduce((sum, nota) => sum + nota.valor, 0) });
    } catch (error) {
        console.error('[contabilidade/cte]', error.message);
        res.status(500).json({ success: false, error: 'Não foi possível consultar os CT-e.' });
    }
});

module.exports = router;
