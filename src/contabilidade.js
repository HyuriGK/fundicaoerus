const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

router.get('/notas-servico', async (req, res) => {
    const dataInicio = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dataInicio || '') ? req.query.dataInicio : new Date().toISOString().slice(0, 8) + '01';
    const dataFim = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dataFim || '') ? req.query.dataFim : new Date().toISOString().slice(0, 10);

    try {
        const { rows } = await pool.query(`
            SELECT
                data, cnpj, prestador, nota_fiscal,
                SUM(valor) AS valor,
                STRING_AGG(DISTINCT cfop::text, ', ') AS cfop,
                SUM(icms) AS icms,
                SUM(ipi) AS ipi,
                SUM(pis) AS pis,
                SUM(cofins) AS cofins,
                COALESCE(STRING_AGG(DISTINCT NULLIF(centro_custo_codigo, ''), ', '), '') AS centro_custo_codigo,
                COALESCE(STRING_AGG(DISTINCT NULLIF(centro_custo, ''), ', '), '') AS centro_custo
            FROM notas_contabilidade_sync
            WHERE batch_id = (SELECT batch_id FROM contabilidade_sync_batches WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1)
              AND data BETWEEN $1::date AND $2::date
              AND tipo_nota = '99'
            GROUP BY data, cnpj, prestador, nota_fiscal
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
            SELECT
                data, cnpj, prestador, nota_fiscal,
                SUM(valor) AS valor,
                STRING_AGG(DISTINCT cfop::text, ', ') AS cfop,
                SUM(icms) AS icms,
                SUM(ipi) AS ipi,
                SUM(pis) AS pis,
                SUM(cofins) AS cofins,
                COALESCE(STRING_AGG(DISTINCT NULLIF(centro_custo_codigo, ''), ', '), '') AS centro_custo_codigo,
                COALESCE(STRING_AGG(DISTINCT NULLIF(centro_custo, ''), ', '), '') AS centro_custo
            FROM notas_contabilidade_sync
            WHERE batch_id = (SELECT batch_id FROM contabilidade_sync_batches WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1)
              AND data BETWEEN $1::date AND $2::date
              AND tipo_nota = '57'
              AND cfop::text = ANY($3::text[])
            GROUP BY data, cnpj, prestador, nota_fiscal
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

router.get('/nfe-entrada', async (req, res) => {
    const dataInicio = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dataInicio || '') ? req.query.dataInicio : new Date().toISOString().slice(0, 8) + '01';
    const dataFim = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dataFim || '') ? req.query.dataFim : new Date().toISOString().slice(0, 10);
    const cfopsCte = ['135200', '135201', '135202', '235200', '235201', '235202'];

    try {
        const { rows } = await pool.query(`
            SELECT
                data, cnpj, prestador, nota_fiscal,
                SUM(valor) AS valor,
                STRING_AGG(DISTINCT cfop::text, ', ') AS cfop,
                SUM(icms) AS icms,
                SUM(ipi) AS ipi,
                SUM(pis) AS pis,
                SUM(cofins) AS cofins,
                COALESCE(STRING_AGG(DISTINCT NULLIF(centro_custo_codigo, ''), ', '), '') AS centro_custo_codigo,
                COALESCE(STRING_AGG(DISTINCT NULLIF(centro_custo, ''), ', '), '') AS centro_custo
            FROM notas_contabilidade_sync nfe
            WHERE nfe.batch_id = (SELECT batch_id FROM contabilidade_sync_batches WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1)
              AND data BETWEEN $1::date AND $2::date
              AND tipo_nota = '55'
              AND cfop::text <> ALL($3::text[])
              AND NOT EXISTS (
                  SELECT 1 FROM notas_contabilidade_sync nfse
                  WHERE nfse.batch_id = nfe.batch_id AND nfse.tipo_nota = '99' AND nfse.cfop = nfe.cfop
              )
            GROUP BY data, cnpj, prestador, nota_fiscal
            ORDER BY data DESC, nota_fiscal DESC
        `, [dataInicio, dataFim, cfopsCte]);
        const notas = rows.map(row => ({
            data: row.data, cnpj: String(row.cnpj || '').trim(), prestador: String(row.prestador || '').trim(),
            notaFiscal: row.nota_fiscal, valor: Number(row.valor) || 0, cfop: row.cfop,
            icms: Number(row.icms) || 0, ipi: Number(row.ipi) || 0, pis: Number(row.pis) || 0, cofins: Number(row.cofins) || 0,
            centroCustoCodigo: row.centro_custo_codigo || '', centroCustoDescricao: row.centro_custo || 'Sem centro de custo'
        }));
        res.json({ success: true, dataInicio, dataFim, notas, total: notas.reduce((sum, nota) => sum + nota.valor, 0) });
    } catch (error) {
        console.error('[contabilidade/nfe-entrada]', error.message);
        res.status(500).json({ success: false, error: 'Não foi possível consultar as NF-es de entrada.' });
    }
});

module.exports = router;
