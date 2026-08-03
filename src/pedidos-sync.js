const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

let modeloStatusTableReady = false;
async function ensureModeloStatusTable() {
    if (modeloStatusTableReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS pedidos_modelo_status (
            sync_key TEXT PRIMARY KEY,
            modelo_status TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_pedidos_modelo_status_sync_key ON pedidos_modelo_status(sync_key);
    `);
    modeloStatusTableReady = true;
}

function getCommercialOwnerRestriction(req) {
    const role = String(req.user?.role || '').trim().toLowerCase();
    const username = String(req.user?.user || '').trim().toLowerCase();
    const name = String(req.user?.name || '').trim().toLowerCase();
    if (role === 'comercial' && (username === 'geruza' || name === 'geruza mendes')) {
        return 'GERUZA MENDES';
    }
    if (role === 'comercial' && (username === 'elisangela' || name === 'elisangela')) {
        return 'ELISANGELA';
    }
    return null;
}

async function getOpsAbertas() {
    const result = await pool.query(`
        SELECT data, updated_at
        FROM firebird_sync_pedidos
        WHERE sync_key LIKE 'OP-%'
          AND data->>'STATUS_PCP' NOT IN ('C', 'E', 'F')
          AND data->>'OP_PCS' ~ '^[0-9]{4}$'
        ORDER BY (data->>'OP_PCS')::int DESC
    `);

    return result.rows.map(row => ({
        ...row.data,
        _sync_updated_at: row.updated_at
    }));
}

function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getCommercialBalance(item) {
    const saldoLiberado = num(item.SALDO_LIBERADO_FATURAR_PPR);
    if (saldoLiberado > 0) return saldoLiberado;
    return Math.max(0,
        num(item.QUANTIDADE_PPR) -
        num(item.QUANTIDADE_FATURADA_PPR) -
        num(item.QUANTIDADE_DESISTENCIA_PPR)
    );
}

function getItemWeight(item, weightsMap) {
    const produto = String(item.PRODUTO_PPR || '').trim();
    const unitWeight = num(item.PESO_UNIT) || num(item.PESO_PRODUTO) || num(weightsMap[produto]);
    return unitWeight * getCommercialBalance(item);
}

// Rota para buscar peso unitário, descrição e saldo em aberto por código (usado por acabamento_externo)
// Prioridade peso: PRODUTO.PESO_LIQUIDO_PRO sincronizado > pesos_customizados (fallback manual)
router.get('/peso-lookup', async (req, res) => {
    const { codigo } = req.query;
    if (!codigo) return res.json({ peso: null, descricao: null, saldo: 0, source: null });
    const cod = String(codigo).trim().toUpperCase();
    try {
        const [cwRes, produtoRes, saldoRes, clienteRes] = await Promise.all([
            pool.query(
                `SELECT peso FROM pesos_customizados WHERE UPPER(codigo) = $1`,
                [cod]
            ),
            pool.query(
                `SELECT
                   peso_liquido_pro AS peso,
                   nome_pro AS descricao
                 FROM ficha_tecnica
                 WHERE UPPER(TRIM(pro_codigo_fic::text)) = $1
                   AND peso_liquido_pro > 0
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
            ),
            pool.query(
                `SELECT COALESCE(
                    NULLIF(data->>'CLIENTE_NOME_PPR', ''),
                    NULLIF(data->>'NOME_CLIENTE_PPR', ''),
                    NULLIF(data->>'NOME_CLIENTE', ''),
                    NULLIF(data->>'RAZAO_SOCIAL_CLI', ''),
                    NULLIF(data->>'CLIENTE_PPR', ''),
                    NULLIF(data->>'ID_CLIENTE_CORE', '')
                 ) AS cliente
                 FROM firebird_sync_emissoes
                 WHERE UPPER(data->>'PRODUTO_PPR') = $1
                 ORDER BY updated_at DESC
                 LIMIT 1`,
                [cod]
            )
        ]);

        const saldo = Number(saldoRes.rows[0].saldo) || 0;
        const produto = produtoRes.rows[0] || null;
        const descricao = produto ? (produto.descricao || null) : null;
        const cliente = clienteRes.rows[0]?.cliente || null;

        if (produto && Number(produto.peso) > 0) {
            return res.json({ peso: Number(produto.peso), descricao, cliente, saldo, source: 'produto' });
        }

        // Peso: customizado fica como fallback para itens sem peso liquido no ERP
        if (cwRes.rows.length > 0 && Number(cwRes.rows[0].peso) > 0) {
            return res.json({ peso: Number(cwRes.rows[0].peso), descricao, cliente, saldo, source: 'custom' });
        }

        return res.json({ peso: null, descricao, cliente, saldo, source: null });
    } catch (err) {
        console.error('Erro ao buscar peso por código:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
});

router.get('/ops-abertas', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await getOpsAbertas());
    } catch (error) {
        console.error('Erro ao buscar OPs abertas:', error);
        res.status(500).json({ error: 'Erro interno ao buscar OPs abertas.' });
    }
});

router.get('/resumo-carteira', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        await ensureModeloStatusTable();
        const commercialOwner = getCommercialOwnerRestriction(req);
        const ownerJoin = commercialOwner ? `
                JOIN clientes_firebird_sync c
                    ON c.codigo::text = p.data->>'ID_CLIENTE_CORE'
                JOIN clientes_responsavel_comercial rc
                    ON rc.empresa = c.empresa
                    AND rc.codigo = c.codigo
                    AND rc.responsavel_comercial = $1
        ` : '';
        const ownerParams = commercialOwner ? [commercialOwner] : [];
        const result = await pool.query(`
            WITH base AS (
                SELECT
                    UPPER(TRIM(COALESCE(p.data->>'NOME_CLIENTE', 'Desconhecido'))) AS cliente,
                    NULLIF(TRIM(COALESCE(p.data->>'CODIGO_PPR', p.data->>'PEDIDO_PPR', p.data->>'NUMERO_PEDIDO', '')), '') AS pedido,
                    GREATEST(
                        0,
                        COALESCE(CASE WHEN p.data->>'SALDO_LIBERADO_FATURAR_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'SALDO_LIBERADO_FATURAR_PPR', ',', '.')::numeric END, 0),
                        COALESCE(CASE WHEN p.data->>'QUANTIDADE_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_PPR', ',', '.')::numeric END, 0)
                        - COALESCE(CASE WHEN p.data->>'QUANTIDADE_FATURADA_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_FATURADA_PPR', ',', '.')::numeric END, 0)
                        - COALESCE(CASE WHEN p.data->>'QUANTIDADE_DESISTENCIA_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_DESISTENCIA_PPR', ',', '.')::numeric END, 0)
                    ) AS saldo,
                    COALESCE(
                        NULLIF(f.peso_liquido_pro, 0),
                        NULLIF(CASE WHEN p.data->>'PESO_UNIT' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'PESO_UNIT', ',', '.')::numeric END, 0),
                        NULLIF(CASE WHEN p.data->>'PESO_PRODUTO' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'PESO_PRODUTO', ',', '.')::numeric END, 0),
                        pc.peso,
                        0
                    ) AS peso_unit
                FROM firebird_sync_emissoes p
                LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
                LEFT JOIN pesos_customizados pc ON pc.codigo = TRIM(p.data->>'PRODUTO_PPR')
                ${ownerJoin}
                WHERE
                    (COALESCE(CASE WHEN p.data->>'QUANTIDADE_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_PPR', ',', '.')::numeric END, 0)
                    - COALESCE(CASE WHEN p.data->>'QUANTIDADE_FATURADA_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_FATURADA_PPR', ',', '.')::numeric END, 0)
                    - COALESCE(CASE WHEN p.data->>'QUANTIDADE_DESISTENCIA_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_DESISTENCIA_PPR', ',', '.')::numeric END, 0)) > 0
                    AND (p.data->>'STATUS_PPR') <> 'C'
                    AND RIGHT(TRIM(p.data->>'PRODUTO_PPR'), 1) <> '1'
                    AND UPPER(TRIM(COALESCE(p.data->>'FATURADO_PPR', ''))) <> 'T'
            ),
            por_cliente AS (
                SELECT
                    cliente,
                    SUM(saldo * peso_unit) AS peso_kg,
                    COUNT(*) AS total_itens,
                    COUNT(DISTINCT pedido) FILTER (WHERE pedido IS NOT NULL) AS pedidos_unicos
                FROM base
                GROUP BY cliente
            )
            SELECT
                cliente,
                peso_kg,
                total_itens,
                pedidos_unicos,
                SUM(peso_kg) OVER () AS total_kg,
                SUM(total_itens) OVER () AS total_itens_geral
            FROM por_cliente
            ORDER BY peso_kg DESC
            LIMIT 10
        `, ownerParams);

        const totalKg = parseFloat(result.rows[0]?.total_kg || 0);
        const totalItens = parseInt(result.rows[0]?.total_itens_geral || 0, 10);
        const topClientes = result.rows.map(row => ({
            cliente: row.cliente,
            pesoKg: parseFloat(row.peso_kg || 0),
            pedidosUnicos: parseInt(row.pedidos_unicos || 0, 10)
        }));

        res.json({ success: true, totalKg, totalItens, topClientes });
    } catch (error) {
        console.error('Erro ao buscar resumo da carteira:', error);
        res.status(500).json({ success: false, error: 'Erro interno ao buscar resumo da carteira.' });
    }
});

// Rota para buscar os pedidos sincronizados
router.get('/', async (req, res) => {
    const { carteiraOnly } = req.query;
    try {
        if (String(req.get('referer') || '').includes('ordemdeproducao.html')) {
            res.set('Cache-Control', 'no-store');
            return res.json(await getOpsAbertas());
        }

        await ensureModeloStatusTable();
        const commercialOwner = getCommercialOwnerRestriction(req);
        const ownerJoin = commercialOwner ? `
                JOIN clientes_firebird_sync c
                    ON c.codigo::text = p.data->>'ID_CLIENTE_CORE'
                JOIN clientes_responsavel_comercial rc
                    ON rc.empresa = c.empresa
                    AND rc.codigo = c.codigo
                    AND rc.responsavel_comercial = $1
        ` : '';
        const ownerParams = commercialOwner ? [commercialOwner] : [];
        let query;
        if (carteiraOnly === 'true') {
            query = `
                SELECT
                    p.sync_key,
                    p.data,
                    p.updated_at,
                    f.data_fic,
                    f.pro_codigo_fic AS has_ficha,
                    f.peso_liquido_pro AS ficha_peso_liquido_pro,
                    f.tipo_moldagem_procedimento,
                    obs.observacao,
                    ms.modelo_status
                FROM firebird_sync_emissoes p
                LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
                LEFT JOIN pedidos_observacoes obs ON obs.sync_key = p.sync_key
                LEFT JOIN pedidos_modelo_status ms ON ms.sync_key = p.sync_key
                ${ownerJoin}
                WHERE
                    ((p.data->>'QUANTIDADE_PPR')::numeric - COALESCE((p.data->>'QUANTIDADE_FATURADA_PPR')::numeric, 0) - COALESCE((p.data->>'QUANTIDADE_DESISTENCIA_PPR')::numeric, 0)) > 0
                    AND (p.data->>'STATUS_PPR') <> 'C'
                    AND COALESCE(p.data->>'STATUS_PCP', '') NOT IN ('C', 'E', 'F')
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
                    f.peso_liquido_pro AS ficha_peso_liquido_pro,
                    f.tipo_moldagem_procedimento,
                    obs.observacao,
                    ms.modelo_status
                FROM firebird_sync_emissoes p
                LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
                LEFT JOIN pedidos_observacoes obs ON obs.sync_key = p.sync_key
                LEFT JOIN pedidos_modelo_status ms ON ms.sync_key = p.sync_key
                ${ownerJoin}
                ORDER BY
                    (f.pro_codigo_fic IS NOT NULL) DESC,
                    f.data_fic DESC NULLS LAST,
                    p.updated_at DESC
                LIMIT 1500
            `;
        }

        const result = await pool.query(query, ownerParams);

        // Buscar vínculos manuais confirmados/rejeitados para sobrescrever LINK_STATUS em tempo real
        const linksResult = await pool.query('SELECT sync_key, op, status FROM pedidos_op_links');
        const linksMap = {};
        linksResult.rows.forEach(l => { linksMap[l.sync_key] = l; });
        const closedOpsResult = await pool.query(`
            SELECT data->>'OP_PCS' AS op
            FROM firebird_sync_pedidos
            WHERE sync_key LIKE 'OP-%'
              AND COALESCE(data->>'STATUS_PCP', '') IN ('C', 'E', 'F')
        `);
        const closedOps = new Set(closedOpsResult.rows.map(row => String(row.op || '').trim()).filter(Boolean));
        const produtoPesoResult = await pool.query(`
            SELECT
                data->>'PRODUTO_PPR' AS produto,
                data->>'PESO_PRODUTO' AS peso_produto
            FROM firebird_sync_pedidos
            WHERE sync_key LIKE 'OP-%'
              AND NULLIF(data->>'PRODUTO_PPR', '') IS NOT NULL
              AND NULLIF(data->>'PESO_PRODUTO', '') IS NOT NULL
        `);
        const produtoPesoMap = {};
        produtoPesoResult.rows.forEach(row => {
            const produto = String(row.produto || '').trim();
            if (produto && !produtoPesoMap[produto]) produtoPesoMap[produto] = Number(row.peso_produto);
        });

        // Extrair o JSONB para o nível raiz para facilitar o frontend
        const pedidos = result.rows.map(row => {
            const item = {
                ...row.data,
                sync_key: row.sync_key,
                observacao: row.observacao || '',
                modelo_status: row.modelo_status || '',
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
            const produtoKey = String(item.PRODUTO_PPR || '').trim();
            if (Number(row.ficha_peso_liquido_pro) > 0) {
                item.PESO_PRODUTO = Number(row.ficha_peso_liquido_pro);
            }
            if ((!item.PESO_PRODUTO || Number(item.PESO_PRODUTO) <= 0) && produtoKey && produtoPesoMap[produtoKey]) {
                item.PESO_PRODUTO = produtoPesoMap[produtoKey];
            }
            const opValue = String(item.OP_PCS || '').trim();
            if (item.LINK_STATUS === 'sugerido' && !/^\d{1,4}$/.test(opValue)) {
                item.LINK_STATUS = null;
                item.OP_PCS = null;
            }
            return item;
        }).filter(item => {
            const opValue = String(item.OP_PCS || '').trim();
            return !opValue || !closedOps.has(opValue);
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
        const monthly = req.query.view === 'monthly';
        const query = `
            SELECT ${monthly ? 'DISTINCT ON (EXTRACT(MONTH FROM s.snapshot_date))' : ''}
                TO_CHAR(s.snapshot_date, 'YYYY-MM-DD') as date,
                aguardando_qty, aguardando_weight,
                COALESCE((TO_JSONB(s)->>'aguardando_value')::numeric, 0) AS aguardando_value,
                moldagem_qty, moldagem_weight,
                COALESCE((TO_JSONB(s)->>'moldagem_value')::numeric, 0) AS moldagem_value,
                COALESCE((TO_JSONB(s)->>'moldagem_pesada_qty')::numeric, 0) AS moldagem_pesada_qty,
                COALESCE((TO_JSONB(s)->>'moldagem_pesada_weight')::numeric, 0) AS moldagem_pesada_weight,
                COALESCE((TO_JSONB(s)->>'moldagem_pesada_value')::numeric, 0) AS moldagem_pesada_value,
                COALESCE((TO_JSONB(s)->>'moldagem_leve_qty')::numeric, 0) AS moldagem_leve_qty,
                COALESCE((TO_JSONB(s)->>'moldagem_leve_weight')::numeric, 0) AS moldagem_leve_weight,
                COALESCE((TO_JSONB(s)->>'moldagem_leve_value')::numeric, 0) AS moldagem_leve_value,
                COALESCE((TO_JSONB(s)->>'moldagem_manual_qty')::numeric, 0) AS moldagem_manual_qty,
                COALESCE((TO_JSONB(s)->>'moldagem_manual_weight')::numeric, 0) AS moldagem_manual_weight,
                COALESCE((TO_JSONB(s)->>'moldagem_manual_value')::numeric, 0) AS moldagem_manual_value,
                COALESCE((TO_JSONB(s)->>'moldagem_outros_qty')::numeric, 0) AS moldagem_outros_qty,
                COALESCE((TO_JSONB(s)->>'moldagem_outros_weight')::numeric, 0) AS moldagem_outros_weight,
                COALESCE((TO_JSONB(s)->>'moldagem_outros_value')::numeric, 0) AS moldagem_outros_value,
                fusao_qty, fusao_weight,
                COALESCE((TO_JSONB(s)->>'fusao_value')::numeric, 0) AS fusao_value,
                acabamento_qty, acabamento_weight,
                COALESCE((TO_JSONB(s)->>'acabamento_value')::numeric, 0) AS acabamento_value,
                tt_qty, tt_weight,
                COALESCE((TO_JSONB(s)->>'tt_value')::numeric, 0) AS tt_value,
                usinagem_qty, usinagem_weight,
                COALESCE((TO_JSONB(s)->>'usinagem_value')::numeric, 0) AS usinagem_value,
                qualidade_qty, qualidade_weight,
                COALESCE((TO_JSONB(s)->>'qualidade_value')::numeric, 0) AS qualidade_value,
                expedicao_qty, expedicao_weight,
                COALESCE((TO_JSONB(s)->>'expedicao_value')::numeric, 0) AS expedicao_value
            FROM industrial_snapshots s
            WHERE EXTRACT(YEAR  FROM s.snapshot_date) = $1
              ${monthly ? '' : 'AND EXTRACT(MONTH FROM s.snapshot_date) = $2'}
            ORDER BY ${monthly ? 'EXTRACT(MONTH FROM s.snapshot_date), s.snapshot_date DESC' : 's.snapshot_date ASC'}
        `;
        const result = await pool.query(query, monthly ? [year] : [year, month]);
        res.json(result.rows);
    } catch (error) {
        console.error('Erro ao buscar histórico industrial:', error);
        res.status(500).json({ error: 'Erro interno ao buscar histórico.' });
    }
});

module.exports = router;
