const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// Rota para buscar peso efetivo de um produto por código (usado por acabamento_externo)
// Prioridade: PESO_UNIT (Firebird) > pesos_customizados (manual)
router.get('/peso-lookup', async (req, res) => {
    const { codigo } = req.query;
    if (!codigo) return res.json({ peso: null, source: null });
    const cod = String(codigo).trim().toUpperCase();
    try {
        // 1. PESO_UNIT do Firebird (mais recente com peso válido)
        const fbRes = await pool.query(
            `SELECT (data->>'PESO_UNIT')::numeric AS peso
             FROM firebird_sync_emissoes
             WHERE UPPER(data->>'PRODUTO_PPR') = $1
               AND data->>'PESO_UNIT' IS NOT NULL
               AND (data->>'PESO_UNIT')::numeric > 0
             ORDER BY updated_at DESC
             LIMIT 1`,
            [cod]
        );
        if (fbRes.rows.length > 0) {
            return res.json({ peso: Number(fbRes.rows[0].peso), source: 'firebird' });
        }
        // 2. Peso customizado (cadastrado manualmente em pedidos.html)
        const cwRes = await pool.query(
            `SELECT peso FROM pesos_customizados WHERE UPPER(codigo) = $1`,
            [cod]
        );
        if (cwRes.rows.length > 0 && cwRes.rows[0].peso > 0) {
            return res.json({ peso: Number(cwRes.rows[0].peso), source: 'custom' });
        }
        return res.json({ peso: null, source: null });
    } catch (err) {
        console.error('Erro ao buscar peso por código:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

// Rota para buscar os pedidos sincronizados
router.get('/', async (req, res) => {
    const { carteiraOnly } = req.query;
    try {
        let query;
        if (carteiraOnly === 'true') {
            query = `
                SELECT 
                    p.sync_key, 
                    p.data,
                    p.updated_at,
                    f.data_fic,
                    f.pro_codigo_fic AS has_ficha,
                    obs.observacao
                FROM firebird_sync_emissoes p
                LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
                LEFT JOIN pedidos_observacoes obs ON obs.sync_key = p.sync_key
                WHERE
                    ((p.data->>'QUANTIDADE_PPR')::numeric - COALESCE((p.data->>'QUANTIDADE_FATURADA_PPR')::numeric, 0) - COALESCE((p.data->>'QUANTIDADE_DESISTENCIA_PPR')::numeric, 0)) > 0
                    AND (p.data->>'STATUS_PPR') <> 'C'
                ORDER BY 
                    (f.pro_codigo_fic IS NOT NULL) DESC,
                    f.data_fic DESC NULLS LAST,
                    p.updated_at DESC
                LIMIT 1500
            `;
        } else {
            query = `
                SELECT 
                    p.sync_key, 
                    p.data,
                    p.updated_at,
                    f.data_fic,
                    f.pro_codigo_fic AS has_ficha,
                    obs.observacao
                FROM firebird_sync_emissoes p
                LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
                LEFT JOIN pedidos_observacoes obs ON obs.sync_key = p.sync_key
                ORDER BY 
                    (f.pro_codigo_fic IS NOT NULL) DESC,
                    f.data_fic DESC NULLS LAST,
                    p.updated_at DESC
                LIMIT 1500
            `;
        }

        const result = await pool.query(query);

        // Buscar vínculos manuais confirmados/rejeitados para sobrescrever LINK_STATUS em tempo real
        const linksResult = await pool.query('SELECT sync_key, op, status FROM pedidos_op_links');
        const linksMap = {};
        linksResult.rows.forEach(l => { linksMap[l.sync_key] = l; });

        // Extrair o JSONB para o nível raiz para facilitar o frontend
        const pedidos = result.rows.map(row => {
            const item = {
                ...row.data,
                sync_key: row.sync_key,
                observacao: row.observacao || '',
                _sync_updated_at: row.updated_at,
                _data_fic: row.data_fic,
                _has_ficha: !!row.has_ficha
            };
            const manualLink = linksMap[row.sync_key];
            if (manualLink) {
                if (manualLink.status === 'confirmado') {
                    item.LINK_STATUS = 'confirmado';
                    item.OP_PCS = manualLink.op;
                } else if (manualLink.status === 'rejeitado') {
                    // Só aplica rejeição se não houver vínculo oficial do ERP
                    if (item.LINK_STATUS !== 'oficial') {
                        item.LINK_STATUS = 'rejeitado';
                        item.OP_PCS = null;
                    }
                }
                // 'removido': apaga o link manual, deixa o JSONB original valer (sugerido volta a aparecer)
            }
            return item;
        });

        res.json(pedidos);
    } catch (error) {
        console.error('Erro ao buscar pedidos sincronizados:', error);
        res.status(500).json({ error: 'Erro interno ao buscar pedidos.' });
    }
});

// Rota para buscar o histórico de snapshots industriais por mês/ano
router.get('/industrial-history', async (req, res) => {
    try {
        const now = new Date();
        const month = parseInt(req.query.month) || (now.getMonth() + 1);
        const year  = parseInt(req.query.year)  || now.getFullYear();
        const query = `
            SELECT
                TO_CHAR(snapshot_date, 'YYYY-MM-DD') as date,
                aguardando_qty, aguardando_weight,
                moldagem_qty, moldagem_weight,
                fusao_qty, fusao_weight,
                acabamento_qty, acabamento_weight,
                tt_qty, tt_weight,
                usinagem_qty, usinagem_weight,
                qualidade_qty, qualidade_weight,
                expedicao_qty, expedicao_weight
            FROM industrial_snapshots
            WHERE EXTRACT(YEAR  FROM snapshot_date) = $1
              AND EXTRACT(MONTH FROM snapshot_date) = $2
            ORDER BY snapshot_date ASC
        `;
        const result = await pool.query(query, [year, month]);
        res.json(result.rows);
    } catch (error) {
        console.error('Erro ao buscar histórico industrial:', error);
        res.status(500).json({ error: 'Erro interno ao buscar histórico.' });
    }
});

module.exports = router;
