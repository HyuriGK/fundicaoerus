const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { Firebird, options: firebirdOptions } = require('../lib/firebird-helper');

// Executa query no Firebird com retry (mesmo padrão das rotas -firebird)
async function fbQuery(query, params = []) {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        let dbConn = null;
        try {
            if (attempt > 1) await new Promise(r => setTimeout(r, 1500 * (attempt - 1)));
            const db = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout de conexão com Firebird')), 12000);
                Firebird.attach(firebirdOptions, (err, d) => { clearTimeout(timeout); err ? reject(err) : resolve(d); });
            });
            dbConn = db;
            return await new Promise((resolve, reject) => {
                db.query(query, params, (err, res) => err ? reject(err) : resolve(res || []));
            });
        } catch (err) {
            lastError = err;
            const retryable = ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'Timeout', 'Network'].some(
                m => err.message.includes(m) || (err.code && String(err.code).includes(m)));
            if (!retryable) break;
        } finally {
            if (dbConn) { try { dbConn.detach(); } catch (e) {} }
        }
    }
    throw lastError;
}

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

// GET /api/insumos-moldagem/corrida/:numero — produtos amarrados a uma corrida (programação da fusão)
router.get('/corrida/:numero', async (req, res) => {
    try {
        const numero = String(req.params.numero || '').trim();
        if (!numero) return res.status(400).json({ success: false, error: 'Número da corrida não informado' });

        // Consulta AO VIVO no Firebird — evita itens faltando por defasagem do sync no Neon
        const rows = await fbQuery(`
            SELECT
                c.CODIGO_COR,
                c.CORRIDA_COR,
                CAST(c.DATA_COR AS DATE) AS DATA_COR,
                CAST(c.DATA_PROGRAMADA_COR AS DATE) AS DATA_PROGRAMADA_COR,
                c.FORNO_COR,
                c.PESO_COR,
                m.MATERIAL_MAT,
                cp.SEQUENCIA_VAZADA_CRPG,
                cp.QUANTIDADE_PROGRAMADA_CRPG,
                p.PRODUTO_PCP,
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
            WHERE c.CORRIDA_COR = ?
            ORDER BY cp.SEQUENCIA_VAZADA_CRPG
        `, [numero]);

        if (!rows.length) {
            return res.status(404).json({ success: false, error: `Nenhuma corrida ${numero} encontrada` });
        }

        const first = rows[0];
        const itens = rows
            .filter(r => r.PRODUTO_PCP)
            .map(r => ({
                sequencia:             r.SEQUENCIA_VAZADA_CRPG,
                produto_pcp:           r.PRODUTO_PCP,
                nome_pro:              r.NOME_PRO,
                quantidade_programada: r.QUANTIDADE_PROGRAMADA_CRPG,
                peso_pcp:              r.PESO_PCP,
            }));

        res.json({
            success: true,
            corrida: {
                codigo_cor:      first.CODIGO_COR,
                corrida_cor:     first.CORRIDA_COR,
                data_cor:        first.DATA_COR,
                data_programada: first.DATA_PROGRAMADA_COR,
                forno_cor:       String(first.FORNO_COR || '').trim(),
                peso_cor:        first.PESO_COR,
                material_mat:    first.MATERIAL_MAT,
            },
            itens
        });

    } catch (err) {
        console.error('[insumos-moldagem/corrida]', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
