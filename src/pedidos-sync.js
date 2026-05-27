const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

// Rota para buscar peso unitário, descrição e saldo em aberto por código (usado por acabamento_externo)
// Prioridade peso: pesos_customizados (manual) > PESO_LIQUIDO_NPR / QUANTIDADE_PPR (Firebird calculado)
router.get('/peso-lookup', async (req, res) => {
    const { codigo } = req.query;
    if (!codigo) return res.json({ peso: null, descricao: null, saldo: 0, source: null });
    const cod = String(codigo).trim().toUpperCase();
    try {
        // Roda em paralelo: peso customizado, dados do firebird e saldo em aberto
        const [cwRes, fbRes, saldoRes] = await Promise.all([
            pool.query(
                `SELECT peso FROM pesos_customizados WHERE UPPER(codigo) = $1`,
                [cod]
            ),
            pool.query(
                `SELECT
                   (data->>'PESO_LIQUIDO_NPR')::numeric AS peso_liquido,
                   GREATEST(
                     COALESCE((data->>'OP_QUANTIDADE')::numeric, 0),
                     COALESCE((data->>'QUANTIDADE_PPR')::numeric, 0)
                   ) AS qty,
                   data->>'NOME_PRODUTO_PPR' AS descricao
                 FROM firebird_sync_emissoes
                 WHERE UPPER(data->>'PRODUTO_PPR') = $1
                   AND (data->>'PESO_LIQUIDO_NPR')::numeric > 0
                   AND GREATEST(
                     COALESCE((data->>'OP_QUANTIDADE')::numeric, 0),
                     COALESCE((data->>'QUANTIDADE_PPR')::numeric, 0)
                   ) > 0
                 ORDER BY updated_at DESC
                 LIMIT 1`,
                [cod]
            ),
            pool.query(
                `SELECT COALESCE(SUM(
                   GREATEST(0,
                     COALESCE((data->>'SALDO_LIBERADO_FATURAR_PPR')::numeric,
                       (data->>'QUANTIDADE_PPR')::numeric
                       - COALESCE((data->>'QUANTIDADE_FATURADA_PPR')::numeric, 0)
                       - COALESCE((data->>'QUANTIDADE_DESISTENCIA_PPR')::numeric, 0)
                     )
                   )
                 ), 0) AS saldo
                 FROM firebird_sync_emissoes
                 WHERE UPPER(data->>'PRODUTO_PPR') = $1
                   AND (data->>'STATUS_PPR') <> 'C'
                   AND UPPER(COALESCE(data->>'FATURADO_PPR', '')) <> 'T'`,
                [cod]
            )
        ]);

        const saldo = Number(saldoRes.rows[0].saldo) || 0;
        const fbRow = fbRes.rows[0] || null;
        const descricao = fbRow ? (fbRow.descricao || null) : null;

        // Peso: customizado tem prioridade
        if (cwRes.rows.length > 0 && Number(cwRes.rows[0].peso) > 0) {
            return res.json({ peso: Number(cwRes.rows[0].peso), descricao, saldo, source: 'custom' });
        }

        // Peso: calculado do Firebird
        if (fbRow) {
            const unitWeight = Number(fbRow.peso_liquido) / Number(fbRow.qty);
            if (unitWeight > 0) {
                return res.json({ peso: Math.round(unitWeight * 1000) / 1000, descricao, saldo, source: 'firebird' });
            }
        }

        return res.json({ peso: null, descricao, saldo, source: null });
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
                    f.tipo_moldagem_procedimento,
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
                    f.tipo_moldagem_procedimento,
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
                _has_ficha: !!row.has_ficha,
                _tipo_moldagem_procedimento: row.tipo_moldagem_procedimento || null
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
