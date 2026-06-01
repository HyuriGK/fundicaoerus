const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/insumos-moldagem?dataInicio=2026-05-01&dataFim=2026-05-31&forno=F1
router.get('/', async (req, res) => {
    try {
        const hoje = new Date();
        const semanaPast = new Date(hoje);
        semanaPast.setDate(hoje.getDate() - 7);

        const dataInicio = req.query.dataInicio || semanaPast.toISOString().split('T')[0];
        const dataFim    = req.query.dataFim    || hoje.toISOString().split('T')[0];

        const params = [dataInicio, dataFim];

        const result = await pool.query(`
            SELECT
                c.codigo_cor,
                c.corrida_cor,
                c.data_cor,
                c.data_programada_cor,
                c.forno_cor,
                c.peso_cor,
                c.material_mat,
                c.sequencia_item,
                c.produto_pcp,
                c.nome_pro,
                c.quantidade_programada,
                c.quantidade_pcp,
                c.peso_pcp,
                c.situacao_apontamento,
                ft.pro_codigo_fic,
                ft.qtde_caixas_macho,
                ft.peso_machos,
                ft.detalhes_machos,
                ft.detalhes_luvas,
                ft.tinta_refrataria_fic,
                ft.peso_bolo_fic,
                ft.qtde_figuras
            FROM corridas_programadas_sync c
            LEFT JOIN ficha_tecnica ft ON ft.pro_codigo_fic = c.produto_pcp::text
            WHERE c.data_programada_cor BETWEEN $1::date AND $2::date
            ORDER BY c.codigo_cor DESC, c.sequencia_item
        `, params);

        // Group by corrida
        const corridaMap = {};
        for (const row of result.rows) {
            const key = row.codigo_cor;
            if (!corridaMap[key]) {
                corridaMap[key] = {
                    codigo_cor:       row.codigo_cor,
                    corrida_cor:      row.corrida_cor,
                    data_cor:         row.data_cor,
                    data_programada:  row.data_programada_cor,
                    forno_cor:    (row.forno_cor || '').trim(),
                    peso_cor:     row.peso_cor,
                    material_mat: row.material_mat,
                    itens: []
                };
            }

            if (!row.produto_pcp) continue;

            corridaMap[key].itens.push({
                sequencia:             row.sequencia_item,
                produto_pcp:           row.produto_pcp,
                nome_pro:              row.nome_pro,
                quantidade_programada: row.quantidade_programada,
                quantidade_pcp:        row.quantidade_pcp,
                peso_pcp:              row.peso_pcp,
                situacao:              (row.situacao_apontamento || '').trim(),
                tem_ficha:             row.pro_codigo_fic != null,
                qtde_caixas_macho:     row.qtde_caixas_macho || 0,
                peso_machos:           row.peso_machos || 0,
                detalhes_machos:       row.detalhes_machos || '',
                detalhes_luvas:        row.detalhes_luvas || '',
                qtde_figuras:          row.qtde_figuras || 0,
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
