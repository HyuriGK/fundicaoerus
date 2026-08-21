const express = require('express');
const router = express.Router();
const { attach } = require('../lib/firebird-helper');

function queryFirebird(sql, params) {
    return new Promise((resolve, reject) => attach((error, db) => {
        if (error) return reject(error);
        db.query(sql, params, (queryError, rows) => {
            db.detach();
            if (queryError) return reject(queryError);
            resolve(rows || []);
        });
    }));
}

router.get('/notas-servico', async (req, res) => {
    const dataInicio = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dataInicio || '') ? req.query.dataInicio : new Date().toISOString().slice(0, 8) + '01';
    const dataFim = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dataFim || '') ? req.query.dataFim : new Date().toISOString().slice(0, 10);

    try {
        const rows = await queryFirebird(`
            SELECT
                c.EMISSAO_COM AS DATA,
                f.CNPJ_CPF_FRN AS CNPJ,
                f.RAZAO_SOCIAL_FRN AS PRESTADOR,
                c.NOTA_COM AS NOTA_FISCAL,
                COALESCE(cpcc.VALOR_CPCC, cp.VALOR_PRODUTOS_CPR, 0) AS VALOR,
                COALESCE(cp.CFOP_CPR, c.CFOP_COM) AS CFOP,
                cc.CODIGO_CTU AS CENTRO_CUSTO_CODIGO,
                cc.NOME_CTU AS CENTRO_CUSTO
            FROM COMPRA c
            JOIN COMPRA_PRODUTO cp ON cp.COM_ID_CPR = c.ID_COM
            LEFT JOIN FORNECEDOR f ON f.CODIGO_FRN = c.FORNECEDOR_COM
            LEFT JOIN COMPRA_PRODUTO_CENTRO_CUSTO cpcc
              ON cpcc.CPR_EMPRESA_CPCC = cp.EMPRESA_CPR
             AND cpcc.CPR_FORNECEDOR_CPCC = cp.FORNECEDOR_CPR
             AND cpcc.CPR_NOTA_CPCC = cp.NOTA_CPR
             AND cpcc.CPR_SERIE_CPCC = cp.SERIE_CPR
             AND cpcc.CPR_ITEM_CPCC = cp.ITEM_CPR
            LEFT JOIN CENTRO_CUSTO cc ON cc.CODIGO_CTU = cpcc.CTU_CODIGO_CPCC
            WHERE c.TIPO_NOTA_COM = '99'
              AND c.EMISSAO_COM BETWEEN ? AND ?
            ORDER BY c.EMISSAO_COM DESC, c.NOTA_COM DESC
        `, [dataInicio, dataFim]);

        const notas = rows.map(row => ({
            data: row.DATA,
            cnpj: String(row.CNPJ || '').trim(),
            prestador: String(row.PRESTADOR || '').trim(),
            notaFiscal: row.NOTA_FISCAL,
            valor: Number(row.VALOR) || 0,
            cfop: row.CFOP,
            centroCusto: [row.CENTRO_CUSTO_CODIGO, row.CENTRO_CUSTO].filter(Boolean).join(' - ') || 'Sem centro de custo'
        }));
        res.json({ success: true, dataInicio, dataFim, notas, total: notas.reduce((sum, nota) => sum + nota.valor, 0) });
    } catch (error) {
        console.error('[contabilidade/notas-servico]', error.message);
        res.status(500).json({ success: false, error: 'Não foi possível consultar as notas de serviço.' });
    }
});

module.exports = router;
