const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// GET /api/insumos-moldagem/corrida/:numero — produtos amarrados a uma corrida (programação da fusão)
router.get('/corrida/:numero', async (req, res) => {
    try {
        const numero = String(req.params.numero || '').trim();
        if (!numero) return res.status(400).json({ success: false, error: 'Número da corrida não informado' });

        // Lê do Neon (corridas_programadas_sync) — Vercel não alcança o Firebird local.
        // Mantido atualizado pelo módulo INSUMOS do sync-forever.
        // JOIN ficha_tecnica p/ dados da capa do PDF (tipo modelo, macho, figuras).
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
                c.op_codigo,
                c.produto_pcp,
                c.nome_pro,
                c.quantidade_programada,
                c.quantidade_pcp,
                c.peso_pcp,
                ft.tipo_modelo_desc,
                ft.qtde_caixas_macho,
                ft.qtde_figuras,
                COALESCE(ftf.foto_base64, ft.foto_base64) AS foto_base64,
                fp.data->>'NOME_CLIENTE' AS cliente_nome,
                COALESCE(fp.data->>'ENTREGA_PED', fp.data->>'OP_ENTREGA') AS data_entrega,
                fp.data->>'LOTE_PCS' AS lote_peca
            FROM corridas_programadas_sync c
            LEFT JOIN ficha_tecnica ft ON ft.pro_codigo_fic = c.produto_pcp::text
            LEFT JOIN ficha_tecnica_fusao ftf ON ftf.pro_codigo = c.produto_pcp::text
            LEFT JOIN firebird_sync_pedidos fp ON fp.sync_key = 'OP-' || c.op_codigo::text
            WHERE TRIM(c.corrida_cor) = $1
            ORDER BY c.codigo_cor DESC, c.sequencia_item
        `, [numero]);

        if (!result.rows.length) {
            return res.status(404).json({ success: false, error: `Nenhuma corrida ${numero} encontrada` });
        }

        const first = result.rows[0];
        const itens = result.rows
            .filter(r => r.produto_pcp)
            .map(r => ({
                sequencia:             r.sequencia_item,
                op_codigo:             r.op_codigo,
                produto_pcp:           r.produto_pcp,
                nome_pro:              r.nome_pro,
                quantidade_programada: r.quantidade_programada,
                peso_pcp:              r.peso_pcp,
                cliente_nome:          r.cliente_nome || '',
                data_entrega:          r.data_entrega || '',
                lote_peca:             r.lote_peca || '',
                foto_base64:           r.foto_base64 || '',
                tipo_modelo:           r.tipo_modelo_desc || '',
                qtde_caixas_macho:     Number(r.qtde_caixas_macho) || 0,
                qtde_figuras:          Number(r.qtde_figuras) || 0,
            }));

        res.json({
            success: true,
            corrida: {
                codigo_cor:      first.codigo_cor,
                corrida_cor:     first.corrida_cor,
                data_cor:        first.data_cor,
                data_programada: first.data_programada_cor,
                forno_cor:       (first.forno_cor || '').trim(),
                peso_cor:        first.peso_cor,
                material_mat:    first.material_mat,
            },
            itens
        });

    } catch (err) {
        console.error('[insumos-moldagem/corrida]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
