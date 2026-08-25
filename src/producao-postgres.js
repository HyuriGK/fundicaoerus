// src/producao-postgres.js
const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { logActivity } = require('./lib/logger');
const { getDashboardSnapshot } = require('../lib/dashboard-snapshot');

let paradasTableReady = false;
let producaoClienteColumnReady = false;
let kpiSnapshotsTableReady = false;

async function ensureKpiSnapshotsTable() {
    if (kpiSnapshotsTableReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS kpi_screen_snapshots_v2 (
            metric_key TEXT NOT NULL,
            source_key TEXT NOT NULL,
            context_key TEXT NOT NULL,
            scope_key TEXT NOT NULL,
            metric_label TEXT NOT NULL,
            metric_value NUMERIC NOT NULL,
            unit TEXT NOT NULL,
            page_url TEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
            PRIMARY KEY (metric_key, source_key, context_key, scope_key)
        );
        CREATE INDEX IF NOT EXISTS idx_kpi_screen_snapshots_v2_updated_at
            ON kpi_screen_snapshots_v2 (updated_at DESC);
    `);
    kpiSnapshotsTableReady = true;
}

function formatKpiTaskValue(value, unit) {
    const number = Number(value || 0);
    const digits = unit === '%' ? 2 : 2;
    return `${number.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}`;
}

function getCommercialOwnerRestriction(req) {
    const role = String(req.user?.role || '').trim().toLowerCase();
    const username = String(req.user?.user || '').trim().toLowerCase();
    const name = String(req.user?.name || '').trim().toLowerCase();
    if (role === 'comercial' && (username === 'geruza' || name === 'geruza mendes')) return 'GERUZA MENDES';
    if (role === 'comercial' && (username === 'elisangela' || name === 'elisangela')) return 'ELISANGELA';
    return null;
}

function appendCommercialOwnerFilter(query, params, clienteExpr, commercialOwner, paramIndex) {
    if (!commercialOwner) return { query, paramIndex };
    query += `
        AND EXISTS (
            SELECT 1
            FROM clientes_firebird_sync c
            JOIN clientes_responsavel_comercial rc
                ON rc.empresa = c.empresa
                AND rc.codigo = c.codigo
            WHERE rc.responsavel_comercial = $${paramIndex}
              AND (
                  UPPER(TRIM(c.razao_social)) = UPPER(TRIM(${clienteExpr}))
                  OR UPPER(TRIM(c.fantasia)) = UPPER(TRIM(${clienteExpr}))
              )
        )
    `;
    params.push(commercialOwner);
    return { query, paramIndex: paramIndex + 1 };
}

async function ensureProducaoClienteColumn() {
    if (producaoClienteColumnReady) return;
    await pool.query(`ALTER TABLE producao_apontada_sincronizada ADD COLUMN IF NOT EXISTS cliente VARCHAR(255)`);
    producaoClienteColumnReady = true;
}

async function ensureParadasTable() {
    if (paradasTableReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS producao_paradas_ap (
            id SERIAL PRIMARY KEY,
            data DATE NOT NULL,
            inicio TIME,
            fim TIME,
            setor TEXT NOT NULL,
            maquina TEXT,
            motivo TEXT NOT NULL,
            usuario TEXT,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`ALTER TABLE producao_paradas_ap ADD COLUMN IF NOT EXISTS maquina TEXT`);
    paradasTableReady = true;
}

// GET /api/producao-postgres
// Returns filtered productio records from the synced table
router.get('/resumo-setores', async (req, res) => {
    try {
        const year = parseInt(req.query.year, 10);
        const month = parseInt(req.query.month, 10);
        if (!year || !month || month < 1 || month > 12) {
            return res.status(400).json({ success: false, message: 'year e month sao obrigatorios' });
        }

        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];
        const commercialOwner = getCommercialOwnerRestriction(req);

        if (commercialOwner) {
            return res.status(503).json({ success: false, message: 'Snapshot de setores sem recorte comercial.' });
        }
        const snapshot = await getDashboardSnapshot('producao_setores');
        if (snapshot?.payload?.monthKey !== `${year}-${String(month).padStart(2, '0')}`) {
            return res.status(503).json({ success: false, message: 'Aguardando snapshot de setores da próxima sincronização.' });
        }
        return res.json({ success: true, totals: snapshot.payload.totals, snapshot: true });

        const params = [startDate, endDate];
        let ownerFilter = '';
        if (commercialOwner) {
            params.push(commercialOwner);
            ownerFilter = `
                AND EXISTS (
                    SELECT 1
                    FROM clientes_firebird_sync c
                    JOIN clientes_responsavel_comercial rc
                        ON rc.empresa = c.empresa
                        AND rc.codigo = c.codigo
                    WHERE rc.responsavel_comercial = $3
                      AND (
                          UPPER(TRIM(c.razao_social)) = UPPER(TRIM(COALESCE(NULLIF(t.cliente, ''), cliente_op.cliente, cliente_codigo.cliente, '')))
                          OR UPPER(TRIM(c.fantasia)) = UPPER(TRIM(COALESCE(NULLIF(t.cliente, ''), cliente_op.cliente, cliente_codigo.cliente, '')))
                      )
                )
            `;
        }

        if (!commercialOwner) {
            const result = await pool.query(`
                SELECT UPPER(TRIM(t.setor)) AS setor,
                       SUM(t.quantidade * COALESCE(NULLIF(t.peso_un, 0), pc.peso, p.peso, 0)) AS peso_total
                FROM producao_apontada_sincronizada t
                LEFT JOIN pesos_customizados pc ON t.codigo_peca = pc.codigo
                LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
                WHERE t.data_producao >= $1 AND t.data_producao <= $2
                  AND TRIM(t.codigo_peca) NOT IN ('18358', '801032102')
                GROUP BY 1
            `, params);
            const totals = {
                'MOLDAGEM GERAL': 0, 'FUSAO': 0, 'ACABAMENTO': 0, 'TRATAMENTO TERMICO': 0,
                'USINAGEM EXPEDICAO': 0, 'INSPECAO DE QUALIDADE': 0, 'EXPEDICAO': 0,
                'MOLDAGEM LEVE': 0, 'MOLDAGEM MANUAL': 0, 'MOLDAGEM PESADA': 0, 'FECHAMENTO MANUAL': 0
            };
            result.rows.forEach(row => {
                const setor = String(row.setor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const peso = parseFloat(row.peso_total || 0);
                const normalizado = setor === 'FUNDICAO' ? 'FUSAO'
                    : setor === 'TT' ? 'TRATAMENTO TERMICO'
                    : setor === 'QUALIDADE' ? 'INSPECAO DE QUALIDADE'
                    : setor === 'USINAGEM' ? 'USINAGEM EXPEDICAO'
                    : setor === 'REBARBACAO' ? 'ACABAMENTO' : setor;
                if (['MOLDAGEM LEVE', 'MOLDAGEM MANUAL', 'MOLDAGEM PESADA'].includes(normalizado)) {
                    totals[normalizado] += peso;
                    totals['MOLDAGEM GERAL'] += peso;
                } else if (Object.prototype.hasOwnProperty.call(totals, normalizado)) {
                    totals[normalizado] += peso;
                }
            });
            return res.json({ success: true, totals });
        }

        const result = await pool.query(`
            WITH base AS (
                SELECT
                    CASE
                        WHEN setor_norm IN ('FUSAO', 'FUNDICAO') THEN 'FUSAO'
                        WHEN setor_norm IN ('TRATAMENTO TERMICO', 'TT') THEN 'TRATAMENTO TERMICO'
                        WHEN setor_norm IN ('INSPECAO DE QUALIDADE', 'QUALIDADE') THEN 'INSPECAO DE QUALIDADE'
                        WHEN setor_norm IN ('USINAGEM EXPEDICAO', 'USINAGEM', '50') THEN 'USINAGEM EXPEDICAO'
                        WHEN setor_norm IN ('FECHAMENTO MANUAL', '116') THEN 'FECHAMENTO MANUAL'
                        WHEN setor_norm = 'EXPEDICAO' THEN 'EXPEDICAO'
                        WHEN setor_norm IN ('ACABAMENTO', 'REBARBACAO') THEN 'ACABAMENTO'
                        ELSE setor_norm
                    END AS setor,
                    TRIM(t.codigo_peca) AS codigo_peca,
                    t.quantidade * COALESCE(NULLIF(t.peso_un, 0), pc.peso, p.peso, 0) AS peso_total
                FROM producao_apontada_sincronizada t
                LEFT JOIN pesos_customizados pc ON t.codigo_peca = pc.codigo
                LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
                LEFT JOIN (
                    SELECT DISTINCT ON (op) op, cliente
                    FROM (
                        SELECT REPLACE(p.sync_key, 'OP-', '') as op, p.data->>'NOME_CLIENTE' as cliente, p.updated_at
                        FROM firebird_sync_pedidos p
                        WHERE p.sync_key LIKE 'OP-%'
                          AND COALESCE(p.data->>'NOME_CLIENTE', '') <> ''

                        UNION ALL

                        SELECT TRIM(e.data->>'OP_PCS') as op, e.data->>'NOME_CLIENTE' as cliente, e.updated_at
                        FROM firebird_sync_emissoes e
                        WHERE COALESCE(e.data->>'OP_PCS', '') <> ''
                          AND COALESCE(e.data->>'NOME_CLIENTE', '') <> ''
                    ) origem_op
                    WHERE op <> '' AND cliente <> ''
                    ORDER BY op, updated_at DESC
                ) cliente_op ON cliente_op.op = TRIM(t.op)
                LEFT JOIN (
                    SELECT DISTINCT ON (codigo_peca) codigo_peca, cliente
                    FROM (
                        SELECT
                            codigo_peca,
                            cliente,
                            COUNT(*) OVER (PARTITION BY codigo_peca, cliente) as ocorrencias,
                            MAX(updated_at) OVER (PARTITION BY codigo_peca, cliente) as ultima_atualizacao
                        FROM (
                            SELECT TRIM(p.data->>'PRODUTO_PPR') as codigo_peca, p.data->>'NOME_CLIENTE' as cliente, p.updated_at
                            FROM firebird_sync_pedidos p
                            WHERE COALESCE(p.data->>'PRODUTO_PPR', '') <> ''
                              AND COALESCE(p.data->>'NOME_CLIENTE', '') <> ''

                            UNION ALL

                            SELECT TRIM(e.data->>'PRODUTO_PPR') as codigo_peca, e.data->>'NOME_CLIENTE' as cliente, e.updated_at
                            FROM firebird_sync_emissoes e
                            WHERE COALESCE(e.data->>'PRODUTO_PPR', '') <> ''
                              AND COALESCE(e.data->>'NOME_CLIENTE', '') <> ''
                        ) origem_codigo
                        WHERE codigo_peca <> '' AND cliente <> ''
                    ) ranking_codigo
                    ORDER BY codigo_peca, ocorrencias DESC, ultima_atualizacao DESC
                ) cliente_codigo ON cliente_codigo.codigo_peca = TRIM(t.codigo_peca)
                CROSS JOIN LATERAL (
                    SELECT UPPER(TRANSLATE(TRIM(COALESCE(t.setor, '')), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) AS setor_norm
                ) norm
                WHERE t.data_producao >= $1
                  AND t.data_producao <= $2
                  ${ownerFilter}
            )
            SELECT setor, SUM(peso_total) AS peso_total
            FROM base
            WHERE NOT (
                setor IN ('FUSAO', 'MOLDAGEM GERAL', 'MOLDAGEM LEVE', 'MOLDAGEM MANUAL', 'MOLDAGEM PESADA', 'MOLDAGEM ROLLOVER', 'MOLDAGEM')
                AND codigo_peca IN ('18358', '801032102')
            )
            GROUP BY setor
        `, params);

        const totals = {
            'MOLDAGEM GERAL': 0,
            'FUSAO': 0,
            'ACABAMENTO': 0,
            'TRATAMENTO TERMICO': 0,
            'USINAGEM EXPEDICAO': 0,
            'INSPECAO DE QUALIDADE': 0,
            'EXPEDICAO': 0,
            'MOLDAGEM LEVE': 0,
            'MOLDAGEM MANUAL': 0,
            'MOLDAGEM PESADA': 0,
            'FECHAMENTO MANUAL': 0
        };

        result.rows.forEach(row => {
            const setor = row.setor;
            const peso = parseFloat(row.peso_total || 0);
            if (['MOLDAGEM LEVE', 'MOLDAGEM MANUAL', 'MOLDAGEM PESADA'].includes(setor)) {
                totals[setor] += peso;
                totals['MOLDAGEM GERAL'] += peso;
            } else if (Object.prototype.hasOwnProperty.call(totals, setor)) {
                totals[setor] += peso;
            }
        });

        res.json({ success: true, totals });
    } catch (error) {
        console.error('Erro resumo-setores producao:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar resumo de producao por setor', error: error.message });
    }
});

router.post('/kpi-snapshot', async (req, res) => {
    try {
        await ensureKpiSnapshotsTable();
        const metricKey = String(req.body.metricKey || '').trim();
        const sourceKey = String(req.body.sourceKey || '').trim();
        const contextKey = String(req.body.contextKey || '').trim();
        const metricLabel = String(req.body.metricLabel || '').trim();
        const unit = String(req.body.unit || '').trim();
        const pageUrl = String(req.body.pageUrl || '').trim();
        const metricValue = Number(req.body.value);
        const commercialOwner = getCommercialOwnerRestriction(req);
        const scopeKey = commercialOwner ? `comercial:${commercialOwner.toLowerCase()}` : 'global';
        const allowedMetrics = ['carteira_peso', 'faturamento_peso', 'refugo_peso', 'refugo_percentual'];
        if (!allowedMetrics.includes(metricKey) || !['index', 'original'].includes(sourceKey)) {
            return res.status(400).json({ success: false, message: 'Métrica inválida.' });
        }
        if (!contextKey || contextKey.length > 40 || !metricLabel || !Number.isFinite(metricValue)) {
            return res.status(400).json({ success: false, message: 'Snapshot inválido.' });
        }
        await pool.query(`
            INSERT INTO kpi_screen_snapshots_v2 (
                metric_key, source_key, context_key, scope_key, metric_label, metric_value, unit, page_url, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (metric_key, source_key, context_key, scope_key) DO UPDATE SET
                metric_label = EXCLUDED.metric_label,
                metric_value = EXCLUDED.metric_value,
                unit = EXCLUDED.unit,
                page_url = EXCLUDED.page_url,
                updated_at = NOW()
        `, [metricKey, sourceKey, contextKey, scopeKey, metricLabel.slice(0, 100), metricValue, unit.slice(0, 12), pageUrl.slice(0, 180)]);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao registrar snapshot de KPI:', error);
        res.status(500).json({ success: false, message: 'Erro ao registrar snapshot de KPI.' });
    }
});

router.get('/', async (req, res) => {
    try {
        // 2. Verificar tarefas (registros com peso zero na tabela sincronizada - Agrupado por Setor)
        if (req.query.action === 'check-tasks') {
            const tasks = [];
            let totalCount = 0;

            // --- TIPA 1: Pesos Zerados na PRODUÇÃO (Tabela sincronizada) ---
            const queryGrouped = `
                SELECT
                    t.setor,
                    COUNT(*) as count
                FROM producao_apontada_sincronizada t
                LEFT JOIN pesos_customizados pc ON t.codigo_peca = pc.codigo
                LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
                WHERE COALESCE(NULLIF(t.peso_un, 0), pc.peso, p.peso, 0) = 0
                GROUP BY t.setor
                ORDER BY count DESC
            `;
            const resultGrouped = await pool.query(queryGrouped);

            for (const row of resultGrouped.rows) {
                const count = parseInt(row.count);
                totalCount += count;

                // Fetch a sample of 2 records for this specific sector
                const sampleQuery = `
                    SELECT
                        TO_CHAR(t.data_producao, 'DD/MM/YYYY') as data,
                        t.codigo_peca,
                        t.produto
                    FROM producao_apontada_sincronizada t
                    LEFT JOIN pesos_customizados pc ON t.codigo_peca = pc.codigo
                    LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
                    WHERE COALESCE(NULLIF(t.peso_un, 0), pc.peso, p.peso, 0) = 0
                    AND t.setor = $1
                    LIMIT 2
                `;
                const sampleResult = await pool.query(sampleQuery, [row.setor]);
                const samples = sampleResult.rows.map(r => ({
                    date: r.data,
                    code: r.codigo_peca,
                    product: r.produto || ''
                }));

                tasks.push({
                    id: `zero-weight-prod-${row.setor.replace(/\s+/g, '-').toLowerCase()}`,
                    sector: row.setor,
                    title: `Pesos Zerados (Produção) - ${row.setor}`,
                    description: `${count} apontamentos estão sem peso unitário. Corrija o cadastro para normalizar os totais de produção e os indicadores do setor.`,
                    samples,
                    actionUrl: `apontamentos_produtivos.html?filter=zero-weight&sector=${encodeURIComponent(row.setor)}`,
                    priority: 'high',
                    count: count
                });
            }

            // --- TIPA 2: Pesos Zerados na CARTEIRA DE PEDIDOS (Novidade) ---
            try {
                // Localiza itens na carteira (backlog) que estão no firebird_sync_pedidos e pesam zero
                const queryPedidosZero = `
                    WITH items_backlog AS (
                        SELECT DISTINCT pedido::text, codigo::text FROM carteira
                    )
                    SELECT 
                        count(*) as count
                    FROM firebird_sync_pedidos p
                    INNER JOIN items_backlog ib 
                        ON TRIM(p.data->>'CODIGO_PPR') = TRIM(ib.pedido) 
                        AND TRIM(p.data->>'PRODUTO_PPR') = TRIM(ib.codigo)
                    LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
                    LEFT JOIN produto_pesos_producao weight_ref ON TRIM(p.data->>'PRODUTO_PPR') = weight_ref.codigo_peca
                    WHERE 
                        COALESCE(
                            pc.peso,
                            NULLIF(CAST(COALESCE(p.data->>'PESO_LIQUIDO_NPR', '0') AS NUMERIC), 0),
                            weight_ref.peso,
                            0
                        ) = 0
                        AND NOT (TRIM(p.data->>'PRODUTO_PPR') LIKE '%1' AND TRIM(p.data->>'NOME_PRODUTO_PPR') LIKE 'MODELO %')
                `;
                const resultPedidosZero = await pool.query(queryPedidosZero);
                const countP = parseInt(resultPedidosZero.rows[0].count || 0);

                if (countP > 0) {
                    totalCount += countP;
                    tasks.push({
                        id: 'zero-weight-pedidos',
                        sector: 'Comercial',
                        title: 'Pesos Zerados (Carteira)',
                        description: `${countP} itens da carteira estão com peso unitário zerado. Isso afeta o peso em aberto e o cálculo do faturamento previsto.`,
                        actionUrl: 'pedidos.html?filter=zero-weight',
                        priority: 'high',
                        count: countP
                    });
                }
            } catch (errP) {
                console.error('⚠️ Erro ao verificar pesos zerados na carteira:', errP.message);
            }

            // OPs sugeridas que ainda aguardam decisão do desenvolvedor
            try {
                const suggestedOpsResult = await pool.query(`
                    SELECT
                        e.sync_key,
                        e.data->>'CODIGO_PPR' AS pedido,
                        e.data->>'PRODUTO_PPR' AS codigo,
                        e.data->>'NOME_PRODUTO_PPR' AS produto,
                        e.data->>'OP_PCS' AS op
                    FROM firebird_sync_emissoes e
                    LEFT JOIN pedidos_op_links l ON l.sync_key = e.sync_key
                    WHERE LOWER(COALESCE(e.data->>'LINK_STATUS', '')) = 'sugerido'
                      AND COALESCE(e.data->>'OP_PCS', '') ~ '^[0-9]{1,4}$'
                      AND COALESCE(e.data->>'STATUS_PPR', '') <> 'C'
                      AND COALESCE(e.data->>'STATUS_PCP', '') NOT IN ('C', 'E', 'F')
                      AND (
                          COALESCE(CASE WHEN e.data->>'QUANTIDADE_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(e.data->>'QUANTIDADE_PPR', ',', '.')::numeric END, 0)
                          - COALESCE(CASE WHEN e.data->>'QUANTIDADE_FATURADA_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(e.data->>'QUANTIDADE_FATURADA_PPR', ',', '.')::numeric END, 0)
                          - COALESCE(CASE WHEN e.data->>'QUANTIDADE_DESISTENCIA_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(e.data->>'QUANTIDADE_DESISTENCIA_PPR', ',', '.')::numeric END, 0)
                      ) > 0
                      AND (l.sync_key IS NULL OR l.status NOT IN ('confirmado', 'rejeitado', 'removido'))
                      AND NOT EXISTS (
                          SELECT 1
                          FROM firebird_sync_pedidos op
                          WHERE op.sync_key LIKE 'OP-%'
                            AND op.data->>'OP_PCS' = e.data->>'OP_PCS'
                            AND COALESCE(op.data->>'STATUS_PCP', '') IN ('C', 'E', 'F')
                      )
                    ORDER BY e.updated_at DESC
                `);
                if (suggestedOpsResult.rows.length) {
                    const count = suggestedOpsResult.rows.length;
                    tasks.push({
                        id: 'pending-suggested-ops',
                        sector: 'Pedidos / OP',
                        title: 'OPs sugeridas aguardando validação',
                        description: `${count} itens possuem uma OP sugerida que ainda precisa ser confirmada ou ignorada pelo desenvolvedor.`,
                        samples: suggestedOpsResult.rows.slice(0, 2).map(row => ({
                            date: `Pedido ${row.pedido || '-'}`,
                            code: `OP ${row.op || '-'}`,
                            product: `${row.codigo || '-'} · ${row.produto || 'Produto sem descrição'}`
                        })),
                        actionUrl: 'pedidos.html?filter=suggested',
                        priority: 'high',
                        count
                    });
                    totalCount += count;
                }
            } catch (suggestedOpsError) {
                console.error('Erro ao verificar OPs sugeridas pendentes:', suggestedOpsError.message);
            }

            // Divergências entre os KPIs exibidos no Dashboard e nas telas de origem
            try {
                await ensureKpiSnapshotsTable();
                const snapshotResult = await pool.query(`
                    SELECT
                        dashboard.metric_key,
                        dashboard.context_key,
                        dashboard.metric_label,
                        dashboard.metric_value AS dashboard_value,
                        original.metric_value AS original_value,
                        dashboard.unit,
                        original.page_url,
                        dashboard.updated_at AS dashboard_updated_at,
                        original.updated_at AS original_updated_at
                    FROM kpi_screen_snapshots_v2 dashboard
                    JOIN kpi_screen_snapshots_v2 original
                      ON original.metric_key = dashboard.metric_key
                     AND original.context_key = dashboard.context_key
                     AND original.scope_key = dashboard.scope_key
                     AND original.source_key = 'original'
                    WHERE dashboard.source_key = 'index'
                      AND dashboard.scope_key = 'global'
                      AND dashboard.updated_at >= NOW() - INTERVAL '24 hours'
                      AND original.updated_at >= NOW() - INTERVAL '24 hours'
                      AND ABS(EXTRACT(EPOCH FROM (dashboard.updated_at - original.updated_at))) <= 21600
                `);
                snapshotResult.rows.forEach(row => {
                    const dashboardValue = Number(row.dashboard_value || 0);
                    const originalValue = Number(row.original_value || 0);
                    const difference = Math.abs(dashboardValue - originalValue);
                    const tolerance = row.unit === '%'
                        ? 0.01
                        : Math.max(0.1, Math.abs(originalValue) * 0.0001);
                    if (difference <= tolerance) return;
                    const percentage = Math.abs(originalValue) > 0 ? (difference / Math.abs(originalValue)) * 100 : 100;
                    tasks.push({
                        id: `kpi-divergence-${row.metric_key}-${row.context_key}`,
                        sector: 'Indicadores',
                        title: `Divergência: ${row.metric_label}`,
                        description: `O Dashboard e a tela original apresentam valores diferentes para ${row.context_key}. Diferença de ${formatKpiTaskValue(difference, row.unit)} (${percentage.toFixed(2)}%).`,
                        samples: [
                            { date: 'Dashboard', code: formatKpiTaskValue(dashboardValue, row.unit), product: '' },
                            { date: 'Tela original', code: formatKpiTaskValue(originalValue, row.unit), product: '' }
                        ],
                        actionUrl: row.page_url || 'index.html',
                        priority: 'high',
                        count: 1
                    });
                    totalCount++;
                });
            } catch (snapshotError) {
                console.error('Erro ao comparar KPIs entre telas:', snapshotError.message);
            }

            // 3. Adicionar alertas de Sincronização Atrasada (> 2 horas)
            try {
                // Garantir fuso horário de Brasília para a sessão
                await pool.query("SET TIME ZONE 'America/Sao_Paulo'");
                
                const syncStatusResult = await pool.query(`
                    SELECT 
                        screen_name, 
                        last_sync_at,
                        EXTRACT(EPOCH FROM (NOW() - last_sync_at))/3600 as hours_diff
                    FROM sync_status
                    WHERE LOWER(TRIM(screen_name)) <> 'assertividade'
                `);

                for (const sync of syncStatusResult.rows) {
                    if (sync.hours_diff > 2) {
                        const lastSync = new Date(sync.last_sync_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                        tasks.push({
                            id: `sync-delay-${sync.screen_name.toLowerCase()}`,
                            sector: 'Sincronização',
                            title: `Dados Desatualizados: ${sync.screen_name}`,
                            description: `Os dados não são atualizados há ${Math.floor(sync.hours_diff)} horas. Última sincronização concluída em ${lastSync}.`,
                            actionUrl: '#',
                            priority: 'high',
                            count: 1
                        });
                        totalCount++;
                    }
                }
            } catch (err) {
                console.error('⚠️ Erro ao verificar status de sincronização:', err.message);
            }

            return res.status(200).json({ 
                count: totalCount,
                tasks: tasks
            });
        }

        const { startDate, endDate, sector, search, limit = 100000 } = req.query;
        const commercialOwner = getCommercialOwnerRestriction(req);
        await ensureProducaoClienteColumn();

        let query = `
            SELECT
                t.id,
                TO_CHAR(t.data_producao, 'YYYY-MM-DD') as data,
                t.setor,
                COALESCE(NULLIF(t.cliente, ''), cliente_op.cliente, cliente_codigo.cliente, '') as cliente,
                t.produto,
                t.liga,
                t.grupo_material,
                t.op,
                t.codigo_peca,
                -- Prioridade: ERP > pesos_customizados (carteira) > produto_pesos_producao (legado) > 0
                COALESCE(NULLIF(t.peso_un, 0), pc.peso, p.peso, 0) as peso_un,
                t.quantidade,
                (t.quantidade * COALESCE(NULLIF(t.peso_un, 0), pc.peso, p.peso, 0)) as peso_total,
                t.peso_un as peso_erp,
                COALESCE(pc.peso, p.peso) as peso_custom
            FROM producao_apontada_sincronizada t
            LEFT JOIN pesos_customizados pc ON t.codigo_peca = pc.codigo
            LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
            LEFT JOIN (
                SELECT DISTINCT ON (op) op, cliente
                FROM (
                    SELECT REPLACE(p.sync_key, 'OP-', '') as op, p.data->>'NOME_CLIENTE' as cliente, p.updated_at
                    FROM firebird_sync_pedidos p
                    WHERE p.sync_key LIKE 'OP-%'
                      AND COALESCE(p.data->>'NOME_CLIENTE', '') <> ''

                    UNION ALL

                    SELECT TRIM(e.data->>'OP_PCS') as op, e.data->>'NOME_CLIENTE' as cliente, e.updated_at
                    FROM firebird_sync_emissoes e
                    WHERE COALESCE(e.data->>'OP_PCS', '') <> ''
                      AND COALESCE(e.data->>'NOME_CLIENTE', '') <> ''
                ) origem_op
                WHERE op <> '' AND cliente <> ''
                ORDER BY op, updated_at DESC
            ) cliente_op ON cliente_op.op = TRIM(t.op)
            LEFT JOIN (
                SELECT DISTINCT ON (codigo_peca) codigo_peca, cliente
                FROM (
                    SELECT
                        codigo_peca,
                        cliente,
                        COUNT(*) OVER (PARTITION BY codigo_peca, cliente) as ocorrencias,
                        MAX(updated_at) OVER (PARTITION BY codigo_peca, cliente) as ultima_atualizacao
                    FROM (
                        SELECT TRIM(p.data->>'PRODUTO_PPR') as codigo_peca, p.data->>'NOME_CLIENTE' as cliente, p.updated_at
                        FROM firebird_sync_pedidos p
                        WHERE COALESCE(p.data->>'PRODUTO_PPR', '') <> ''
                          AND COALESCE(p.data->>'NOME_CLIENTE', '') <> ''

                        UNION ALL

                        SELECT TRIM(e.data->>'PRODUTO_PPR') as codigo_peca, e.data->>'NOME_CLIENTE' as cliente, e.updated_at
                        FROM firebird_sync_emissoes e
                        WHERE COALESCE(e.data->>'PRODUTO_PPR', '') <> ''
                          AND COALESCE(e.data->>'NOME_CLIENTE', '') <> ''
                    ) origem_codigo
                    WHERE codigo_peca <> '' AND cliente <> ''
                ) ranking_codigo
                ORDER BY codigo_peca, ocorrencias DESC, ultima_atualizacao DESC
            ) cliente_codigo ON cliente_codigo.codigo_peca = TRIM(t.codigo_peca)
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;
        const clienteExpr = "COALESCE(NULLIF(t.cliente, ''), cliente_op.cliente, cliente_codigo.cliente, '')";
        ({ query, paramIndex } = appendCommercialOwnerFilter(query, params, clienteExpr, commercialOwner, paramIndex));

        if (startDate) {
            query += ` AND t.data_producao >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND t.data_producao <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        if (sector && sector !== 'Todos') {
            query += ` AND t.setor = $${paramIndex}`;
            params.push(sector);
            paramIndex++;
        }

        if (search) {
            query += ` AND (LOWER(t.produto) LIKE $${paramIndex} OR LOWER(t.liga) LIKE $${paramIndex} OR LOWER(t.codigo_peca) LIKE $${paramIndex} OR LOWER(COALESCE(NULLIF(t.cliente, ''), cliente_op.cliente, cliente_codigo.cliente, '')) LIKE $${paramIndex})`;
            params.push(`%${search.toLowerCase()}%`);
            paramIndex++;
        }

        query += ` ORDER BY t.data_producao DESC, t.id DESC LIMIT $${paramIndex}`;
        params.push(parseInt(limit));

        const result = await pool.query(query, params);

        res.json({
            success: true,
            data: result.rows.map(row => ({
                id: row.id,
                data: row.data, // YYYY-MM-DD
                setor: row.setor,
                cliente: row.cliente || '',
                produto: row.produto,
                liga: row.liga || '',
                grupoMaterial: row.grupo_material || '',
                op: row.op || '',
                codigo_peca: row.codigo_peca || '',
                pesoUn: parseFloat(row.peso_un),
                pesoErp: parseFloat(row.peso_erp || 0),
                pesoCustom: parseFloat(row.peso_custom || 0),
                quantidade: parseFloat(row.quantidade),
                pesoTotal: parseFloat(row.peso_total)
            }))
        });

    } catch (error) {
        console.error('❌ Error fetching production data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/producao-postgres/grupos
// Returns distinct grupo_material values for filter UI
router.get('/grupos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT grupo_material
            FROM producao_apontada_sincronizada
            WHERE grupo_material IS NOT NULL AND grupo_material <> ''
            ORDER BY grupo_material
        `);
        res.json({ success: true, grupos: result.rows.map(r => r.grupo_material) });
    } catch (error) {
        console.error('❌ Error fetching grupos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/producao-postgres/stats
// Returns summary statistics for the filtered period
router.get('/stats', async (req, res) => {
    try {
        const { startDate, endDate, sector } = req.query;
        const commercialOwner = getCommercialOwnerRestriction(req);

        let query = `
            SELECT
                COUNT(*) as total_records,
                SUM(t.quantidade) as total_qty,
                SUM(t.quantidade * COALESCE(NULLIF(t.peso_un, 0), pc.peso, p.peso, 0)) as total_weight
            FROM producao_apontada_sincronizada t
            LEFT JOIN pesos_customizados pc ON t.codigo_peca = pc.codigo
            LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
            LEFT JOIN (
                SELECT DISTINCT ON (op) op, cliente
                FROM (
                    SELECT REPLACE(p.sync_key, 'OP-', '') as op, p.data->>'NOME_CLIENTE' as cliente, p.updated_at
                    FROM firebird_sync_pedidos p
                    WHERE p.sync_key LIKE 'OP-%'
                      AND COALESCE(p.data->>'NOME_CLIENTE', '') <> ''

                    UNION ALL

                    SELECT TRIM(e.data->>'OP_PCS') as op, e.data->>'NOME_CLIENTE' as cliente, e.updated_at
                    FROM firebird_sync_emissoes e
                    WHERE COALESCE(e.data->>'OP_PCS', '') <> ''
                      AND COALESCE(e.data->>'NOME_CLIENTE', '') <> ''
                ) origem_op
                WHERE op <> '' AND cliente <> ''
                ORDER BY op, updated_at DESC
            ) cliente_op ON cliente_op.op = TRIM(t.op)
            LEFT JOIN (
                SELECT DISTINCT ON (codigo_peca) codigo_peca, cliente
                FROM (
                    SELECT
                        codigo_peca,
                        cliente,
                        COUNT(*) OVER (PARTITION BY codigo_peca, cliente) as ocorrencias,
                        MAX(updated_at) OVER (PARTITION BY codigo_peca, cliente) as ultima_atualizacao
                    FROM (
                        SELECT TRIM(p.data->>'PRODUTO_PPR') as codigo_peca, p.data->>'NOME_CLIENTE' as cliente, p.updated_at
                        FROM firebird_sync_pedidos p
                        WHERE COALESCE(p.data->>'PRODUTO_PPR', '') <> ''
                          AND COALESCE(p.data->>'NOME_CLIENTE', '') <> ''

                        UNION ALL

                        SELECT TRIM(e.data->>'PRODUTO_PPR') as codigo_peca, e.data->>'NOME_CLIENTE' as cliente, e.updated_at
                        FROM firebird_sync_emissoes e
                        WHERE COALESCE(e.data->>'PRODUTO_PPR', '') <> ''
                          AND COALESCE(e.data->>'NOME_CLIENTE', '') <> ''
                    ) origem_codigo
                    WHERE codigo_peca <> '' AND cliente <> ''
                ) ranking_codigo
                ORDER BY codigo_peca, ocorrencias DESC, ultima_atualizacao DESC
            ) cliente_codigo ON cliente_codigo.codigo_peca = TRIM(t.codigo_peca)
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;
        const clienteExpr = "COALESCE(NULLIF(t.cliente, ''), cliente_op.cliente, cliente_codigo.cliente, '')";
        ({ query, paramIndex } = appendCommercialOwnerFilter(query, params, clienteExpr, commercialOwner, paramIndex));

        if (startDate) {
            query += ` AND t.data_producao >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND t.data_producao <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        if (sector && sector !== 'Todos') {
            query += ` AND t.setor = $${paramIndex}`;
            params.push(sector);
            paramIndex++;
        }

        const result = await pool.query(query, params);
        const row = result.rows[0];

        res.json({
            success: true,
            stats: {
                totalRecords: parseInt(row.total_records || 0),
                totalQty: parseFloat(row.total_qty || 0),
                totalWeight: parseFloat(row.total_weight || 0)
            }
        });

    } catch (error) {
        console.error('❌ Error fetching stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/producao-postgres/meta
// Returns the goal for a specific month/year (format YYYY-MM)
router.get('/meta', async (req, res) => {
    try {
        const { mes_ano } = req.query; // Expected format: 'YYYY-MM'

        if (!mes_ano) {
            return res.status(400).json({ success: false, error: 'mes_ano is required' });
        }

        const result = await pool.query(
            'SELECT meta_peso FROM producao_metas WHERE mes_ano = $1',
            [mes_ano]
        );

        const meta = result.rows.length > 0 ? parseFloat(result.rows[0].meta_peso) : 0;

        res.json({
            success: true,
            meta: meta
        });

    } catch (error) {
        console.error('❌ Error fetching meta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/producao-postgres/meta
// Sets or updates the goal for a specific month/year
router.post('/meta', async (req, res) => {
    try {
        const { mes_ano, meta } = req.body;

        if (!mes_ano || meta === undefined) {
            return res.status(400).json({ success: false, error: 'mes_ano and meta are required' });
        }

        await pool.query(`
            INSERT INTO producao_metas (mes_ano, meta_peso, atualizado_em)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (mes_ano) 
            DO UPDATE SET 
                meta_peso = EXCLUDED.meta_peso,
                atualizado_em = CURRENT_TIMESTAMP
        `, [mes_ano, meta]);

        logActivity(req.headers['x-user'] || 'Desconhecido', 'UPDATE_META', 'producao_metas', { mes_ano, meta });

        res.json({ success: true });

    } catch (error) {
        console.error('❌ Error saving meta:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
// GET /api/producao-postgres/funcionarios?mes_ano=YYYY-MM
// Returns all sectors for that month as { funcionarios: { 'SETOR': quantidade, ... } }
router.get('/funcionarios', async (req, res) => {
    try {
        const { mes_ano } = req.query;
        if (!mes_ano) return res.status(400).json({ success: false, error: 'mes_ano is required' });
        const result = await pool.query(
            'SELECT setor, quantidade FROM producao_funcionarios WHERE mes_ano = $1',
            [mes_ano]
        );
        const funcionarios = {};
        result.rows.forEach(r => { funcionarios[r.setor] = parseInt(r.quantidade); });
        res.json({ success: true, funcionarios });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/producao-postgres/funcionarios
// Body: { mes_ano, setor, quantidade } or { mes_ano, funcionarios: { setor: quantidade } }
router.post('/funcionarios', async (req, res) => {
    try {
        const { mes_ano, setor, quantidade, funcionarios } = req.body;
        if (!mes_ano) return res.status(400).json({ success: false, error: 'mes_ano is required' });

        const entries = funcionarios
            ? Object.entries(funcionarios)
            : [[setor, quantidade]];

        const alterados = {};
        for (const [s, q] of entries) {
            if (!s || q === undefined) continue;
            await pool.query(`
                INSERT INTO producao_funcionarios (mes_ano, setor, quantidade, atualizado_em)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (mes_ano, setor)
                DO UPDATE SET quantidade = EXCLUDED.quantidade, atualizado_em = CURRENT_TIMESTAMP
            `, [mes_ano, s, parseInt(q)]);
            alterados[s] = parseInt(q);
        }
        logActivity(req.headers['x-user'] || 'Desconhecido', 'UPDATE_FUNCIONARIOS', 'producao_funcionarios', { mes_ano, funcionarios: alterados });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/peso', async (req, res) => {
    const { codigo_peca, peso, peso_anterior } = req.body;

    if (!codigo_peca || peso === undefined) {
        return res.status(400).json({ success: false, error: 'Código da peça e peso são obrigatórios' });
    }

    try {
        const prev = await pool.query('SELECT peso FROM pesos_customizados WHERE codigo = $1', [String(codigo_peca)]);
        const pesoAnterior = (peso_anterior !== undefined && peso_anterior !== null && peso_anterior !== '' && !isNaN(Number(peso_anterior)))
            ? Number(peso_anterior)
            : (prev.rows.length ? Number(prev.rows[0].peso) : null);

        await pool.query(`
            INSERT INTO pesos_customizados (codigo, peso)
            VALUES ($1, $2)
            ON CONFLICT (codigo)
            DO UPDATE SET peso = EXCLUDED.peso
        `, [String(codigo_peca), parseFloat(peso)]);

        logActivity(req.headers['x-user'] || 'Desconhecido', 'UPDATE_PESO', req.headers['x-page'] || 'pesos_customizados', {
            codigo: String(codigo_peca),
            peso_anterior: pesoAnterior,
            peso_novo: parseFloat(peso)
        });

        res.json({ success: true, message: 'Peso salvo com sucesso' });
    } catch (error) {
        console.error('❌ Error saving custom weight:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/producao-postgres/figuras
// Returns a map of { codigo_peca: qtde_figuras } for all codes in ficha_tecnica
router.get('/figuras', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT pro_codigo_fic as codigo_peca, qtde_figuras
            FROM ficha_tecnica
            WHERE qtde_figuras IS NOT NULL AND qtde_figuras > 0
        `);
        const map = {};
        result.rows.forEach(r => { map[r.codigo_peca] = parseInt(r.qtde_figuras); });
        res.json({ success: true, figuras: map });
    } catch (error) {
        console.error('❌ Error fetching figuras:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/paradas', async (req, res) => {
    try {
        await ensureParadasTable();
        const { startDate, endDate } = req.query;
        const params = [];
        let where = 'WHERE 1=1';

        if (startDate) {
            params.push(startDate);
            where += ` AND data >= $${params.length}`;
        }
        if (endDate) {
            params.push(endDate);
            where += ` AND data <= $${params.length}`;
        }

        const result = await pool.query(`
            SELECT
                id,
                TO_CHAR(data, 'YYYY-MM-DD') AS data,
                TO_CHAR(inicio, 'HH24:MI') AS inicio,
                TO_CHAR(fim, 'HH24:MI') AS fim,
                setor,
                maquina,
                motivo,
                usuario
            FROM producao_paradas_ap
            ${where}
            ORDER BY data DESC, inicio NULLS LAST, id DESC
        `, params);

        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Erro ao buscar paradas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/paradas', async (req, res) => {
    try {
        await ensureParadasTable();
        const { id, data, inicio, fim, setor, maquina, motivo, usuario } = req.body;

        if (!data || !setor || !motivo) {
            return res.status(400).json({ success: false, error: 'data, setor e motivo são obrigatórios' });
        }

        const actor = req.headers['x-user'] || usuario || 'Desconhecido';

        if (id) {
            // Captura o estado anterior para auditoria (antes/depois)
            const beforeRes = await pool.query(
                "SELECT TO_CHAR(data,'YYYY-MM-DD') AS data, TO_CHAR(inicio,'HH24:MI') AS inicio, TO_CHAR(fim,'HH24:MI') AS fim, setor, maquina, motivo, usuario FROM producao_paradas_ap WHERE id = $1",
                [id]
            );
            const ant = beforeRes.rows[0] || {};
            const result = await pool.query(`
                UPDATE producao_paradas_ap
                SET data = $1,
                    inicio = NULLIF($2, '')::time,
                    fim = NULLIF($3, '')::time,
                    setor = $4,
                    maquina = $5,
                    motivo = $6,
                    usuario = $7,
                    atualizado_em = CURRENT_TIMESTAMP
                WHERE id = $8
                RETURNING id
            `, [data, inicio || '', fim || '', setor, maquina || null, motivo, usuario || null, id]);
            logActivity(actor, 'UPDATE_PARADA', 'producao_paradas_ap', {
                id,
                antes: { data: ant.data, setor: ant.setor, maquina: ant.maquina || null, inicio: ant.inicio, fim: ant.fim, motivo: ant.motivo, registrado_por: ant.usuario || null },
                depois: { data, setor, maquina: maquina || null, inicio, fim, motivo, registrado_por: usuario || null }
            });
            return res.json({ success: true, id: result.rows[0]?.id || id });
        }

        const result = await pool.query(`
            INSERT INTO producao_paradas_ap (data, inicio, fim, setor, maquina, motivo, usuario)
            VALUES ($1, NULLIF($2, '')::time, NULLIF($3, '')::time, $4, $5, $6, $7)
            RETURNING id
        `, [data, inicio || '', fim || '', setor, maquina || null, motivo, usuario || null]);

        logActivity(actor, 'ADD_PARADA', 'producao_paradas_ap', { id: result.rows[0].id, data, setor, maquina: maquina || null, inicio, fim, registrado_por: usuario || null });

        res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error('Erro ao salvar parada:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/paradas/:id', async (req, res) => {
    try {
        await ensureParadasTable();
        // Captura a parada antes de remover (para auditoria)
        const prev = await pool.query('SELECT data, setor, maquina, inicio, fim, motivo, usuario FROM producao_paradas_ap WHERE id = $1', [req.params.id]);
        await pool.query('DELETE FROM producao_paradas_ap WHERE id = $1', [req.params.id]);
        const p = prev.rows[0] || {};
        logActivity(req.headers['x-user'] || 'Desconhecido', 'DELETE_PARADA', 'producao_paradas_ap', {
            id: req.params.id, data: p.data, setor: p.setor, maquina: p.maquina, registrado_por: p.usuario || null
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao remover parada:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
