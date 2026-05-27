const express = require('express');
const router = express.Router();
const { Firebird, options: firebirdOptions } = require('../lib/firebird-helper');
const pool = require('../lib/db');

function queryFirebird(sql, params = []) {
    return new Promise((resolve, reject) => {
        Firebird.attach(firebirdOptions, (err, db) => {
            if (err) return reject(err);
            db.query(sql, params, (err2, rows) => {
                db.detach();
                if (err2) return reject(err2);
                resolve(rows || []);
            });
        });
    });
}

// GET /api/insumos-moldagem?dataInicio=2026-05-01&dataFim=2026-05-31
router.get('/', async (req, res) => {
    try {
        const hoje = new Date();
        const semanaPast = new Date(hoje);
        semanaPast.setDate(hoje.getDate() - 7);

        const dataInicio = req.query.dataInicio || semanaPast.toISOString().split('T')[0];
        const dataFim    = req.query.dataFim    || hoje.toISOString().split('T')[0];

        const firebirdSQL = `
            SELECT
                c.CODIGO_COR,
                c.CORRIDA_COR,
                CAST(c.DATA_COR AS DATE)         AS DATA_COR,
                c.FORNO_COR,
                c.PESO_COR,
                m.MATERIAL_MAT,
                cp.SEQUENCIA_VAZADA_CRPG,
                cp.QUANTIDADE_PROGRAMADA_CRPG,
                cp.SITUACAO_APONTAMENTO_CRPG,
                p.PRODUTO_PCP,
                p.PRO_EMPRESA_PCP,
                p.QUANTIDADE_PCP,
                p.PESO_PCP,
                pr.NOME_PRO
            FROM CORRIDA c
            LEFT JOIN MATERIAL m ON m.ID_MAT = c.MAT_ID_COR
            LEFT JOIN CORRIDA_PROGRAMADA cp ON cp.COR_CODIGO_CRPG = c.CODIGO_COR
            LEFT JOIN PRODUCAO p
                ON p.EMPRESA_PCP = cp.PCP_EMPRESA_CRPG
               AND p.CODIGO_PCP  = cp.PCP_CODIGO_CRPG
            LEFT JOIN PRODUTO pr
                ON pr.CODIGO_PRO  = p.PRODUTO_PCP
               AND pr.EMPRESA_PRO = p.PRO_EMPRESA_PCP
            WHERE c.SITUACAO_COR = 'A'
              AND c.DATA_COR >= CAST('${dataInicio}' AS DATE)
              AND c.DATA_COR <= CAST('${dataFim}' AS DATE)
            ORDER BY c.CODIGO_COR DESC, cp.SEQUENCIA_VAZADA_CRPG
        `;

        const rows = await queryFirebird(firebirdSQL);

        // Collect unique product codes for PostgreSQL lookup
        const produtoCodes = [...new Set(
            rows.map(r => r.PRODUTO_PCP).filter(Boolean)
        )];

        // Fetch ficha_tecnica from PostgreSQL for all products at once
        let fichaMap = {};
        if (produtoCodes.length > 0) {
            const pgResult = await pool.query(
                `SELECT
                    pro_codigo_fic,
                    qtde_caixas_macho,
                    peso_machos,
                    detalhes_machos,
                    detalhes_luvas,
                    tinta_refrataria_fic,
                    peso_bolo_fic,
                    qtde_figuras
                 FROM ficha_tecnica
                 WHERE pro_codigo_fic = ANY($1)`,
                [produtoCodes]
            );
            pgResult.rows.forEach(ft => {
                fichaMap[ft.pro_codigo_fic] = ft;
            });
        }

        // Group rows by corrida
        const corridaMap = {};
        for (const row of rows) {
            const key = row.CODIGO_COR;
            if (!corridaMap[key]) {
                corridaMap[key] = {
                    codigo_cor:   row.CODIGO_COR,
                    corrida_cor:  row.CORRIDA_COR,
                    data_cor:     row.DATA_COR,
                    forno_cor:    (row.FORNO_COR || '').trim(),
                    peso_cor:     row.PESO_COR,
                    material_mat: row.MATERIAL_MAT,
                    itens: []
                };
            }

            if (!row.PRODUTO_PCP) continue;

            const ft = fichaMap[row.PRODUTO_PCP] || {};
            corridaMap[key].itens.push({
                sequencia:            row.SEQUENCIA_VAZADA_CRPG,
                produto_pcp:          row.PRODUTO_PCP,
                nome_pro:             row.NOME_PRO,
                quantidade_programada: row.QUANTIDADE_PROGRAMADA_CRPG,
                quantidade_pcp:       row.QUANTIDADE_PCP,
                peso_pcp:             row.PESO_PCP,
                situacao:             (row.SITUACAO_APONTAMENTO_CRPG || '').trim(),
                tem_ficha:            !!fichaMap[row.PRODUTO_PCP],
                qtde_caixas_macho:    ft.qtde_caixas_macho || 0,
                peso_machos:          ft.peso_machos || 0,
                detalhes_machos:      ft.detalhes_machos || '',
                detalhes_luvas:       ft.detalhes_luvas || '',
                qtde_figuras:         ft.qtde_figuras || 0,
            });
        }

        const corridas = Object.values(corridaMap);
        res.json({ success: true, total: corridas.length, dataInicio, dataFim, corridas });

    } catch (err) {
        console.error('[insumos-moldagem]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
