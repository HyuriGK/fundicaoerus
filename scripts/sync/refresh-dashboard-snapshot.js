const pool = require('../../lib/db');
const { publishDashboardSnapshot } = require('../../lib/dashboard-snapshot');

async function refreshDashboardSnapshot() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const [fat, carteira, refugo, producao, meta] = await Promise.all([
        pool.query(`
            WITH fat_peso_overrides AS (
                SELECT fp.item_key, fp.item_value::boolean AS fat_peso
                FROM app_preferences p
                CROSS JOIN LATERAL jsonb_each_text(COALESCE(p.value, '{}'::jsonb)) AS fp(item_key, item_value)
                WHERE p.key = 'fat_peso_overrides'
            ), base AS (
                SELECT f.data_faturamento::date AS data,
                    CASE WHEN o.fat_peso IS NOT NULL THEN o.fat_peso
                         WHEN f.gera_financeiro = 'N' THEN false
                         ELSE NOT COALESCE(pref.excluido, f.excluido_manualmente, false) END AS fat_peso,
                    COALESCE(NULLIF(f.peso_un, 0), pc.peso, 0) * COALESCE(f.quantidade, 0) AS peso_total
                FROM faturamento_firebird f
                LEFT JOIN faturamento_firebird_preferencias pref
                    ON pref.nota_fiscal = f.nota_fiscal
                    AND pref.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR)
                    AND COALESCE(pref.pedido, '') = COALESCE(TRIM(f.pedido), '')
                    AND pref.data_faturamento = f.data_faturamento
                    AND pref.quantidade = f.quantidade
                LEFT JOIN pesos_customizados pc ON pc.codigo = TRIM(f.codigo_item)
                LEFT JOIN fat_peso_overrides o ON o.item_key = CONCAT(f.nota_fiscal, '-', COALESCE(TRIM(f.codigo_item), ''), '-', COALESCE(TRIM(f.pedido), ''), '-', f.data_faturamento::date, '-', COALESCE(f.quantidade, 0))
                WHERE f.data_faturamento >= $2 AND f.data_faturamento <= $1
                  AND f.cliente_codigo::text NOT IN ('257', '432', '2020', '316', '2283', '253')
                  AND UPPER(TRIM(COALESCE(f.cliente_nome, ''))) NOT LIKE '%IMEPEL INDUSTRIA MECANICA LTDA%'
                  AND UPPER(TRIM(COALESCE(f.cliente_nome, ''))) NOT LIKE '%STEELROOL INDUSTRIA METALURGICA%'
                  AND UPPER(TRIM(COALESCE(f.cliente_nome, ''))) NOT LIKE '%SPILROD FUNDICAO DE FERRO E ACO LTDA%'
            )
            SELECT data, SUM(CASE WHEN fat_peso THEN peso_total ELSE 0 END) AS total
            FROM base GROUP BY data ORDER BY data
        `, [end, previousStart]),
        pool.query(`
            WITH base AS (
                SELECT
                    UPPER(TRIM(COALESCE(p.data->>'NOME_CLIENTE', 'Desconhecido'))) AS cliente,
                    p.updated_at,
                    f.data_fic,
                    f.pro_codigo_fic AS has_ficha,
                    CASE WHEN COALESCE(CASE WHEN p.data->>'SALDO_LIBERADO_FATURAR_PPR' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (p.data->>'SALDO_LIBERADO_FATURAR_PPR')::numeric END, 0) > 0
                        THEN COALESCE(CASE WHEN p.data->>'SALDO_LIBERADO_FATURAR_PPR' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (p.data->>'SALDO_LIBERADO_FATURAR_PPR')::numeric END, 0)
                        ELSE GREATEST(0,
                            COALESCE(CASE WHEN p.data->>'QUANTIDADE_PPR' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (p.data->>'QUANTIDADE_PPR')::numeric END, 0)
                            - COALESCE(CASE WHEN p.data->>'QUANTIDADE_FATURADA_PPR' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (p.data->>'QUANTIDADE_FATURADA_PPR')::numeric END, 0)
                            - COALESCE(CASE WHEN p.data->>'QUANTIDADE_DESISTENCIA_PPR' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (p.data->>'QUANTIDADE_DESISTENCIA_PPR')::numeric END, 0)
                        ) END AS saldo,
                    COALESCE(
                        NULLIF(CASE WHEN p.data->>'PESO_UNIT' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (p.data->>'PESO_UNIT')::numeric END, 0),
                        NULLIF(f.peso_liquido_pro, 0),
                        NULLIF(CASE WHEN p.data->>'PESO_PRODUTO' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (p.data->>'PESO_PRODUTO')::numeric END, 0),
                        pc.peso, 0
                    ) AS peso_unit
                FROM firebird_sync_emissoes p
                LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = p.data->>'PRODUTO_PPR'
                LEFT JOIN pesos_customizados pc ON pc.codigo = TRIM(p.data->>'PRODUTO_PPR')
                WHERE (COALESCE(CASE WHEN p.data->>'QUANTIDADE_PPR' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (p.data->>'QUANTIDADE_PPR')::numeric END, 0)
                    - COALESCE(CASE WHEN p.data->>'QUANTIDADE_FATURADA_PPR' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (p.data->>'QUANTIDADE_FATURADA_PPR')::numeric END, 0)
                    - COALESCE(CASE WHEN p.data->>'QUANTIDADE_DESISTENCIA_PPR' ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (p.data->>'QUANTIDADE_DESISTENCIA_PPR')::numeric END, 0)) > 0
                  AND p.data->>'STATUS_PPR' <> 'C'
                  AND COALESCE(p.data->>'STATUS_PCP', '') NOT IN ('C', 'E', 'F')
                  AND NOT EXISTS (
                      SELECT 1
                      FROM firebird_sync_pedidos fp
                      WHERE fp.sync_key LIKE 'OP-%'
                        AND COALESCE(fp.data->>'STATUS_PCP', '') IN ('C', 'E', 'F')
                        AND TRIM(fp.data->>'OP_PCS') = TRIM(p.data->>'OP_PCS')
                  )
            ), limite AS (
                SELECT * FROM base
            ), por_cliente AS (
                SELECT cliente, SUM(saldo * peso_unit) AS peso_kg
                FROM limite GROUP BY cliente
            )
            SELECT cliente, peso_kg, SUM(peso_kg) OVER () AS total_kg
            FROM por_cliente ORDER BY peso_kg DESC LIMIT 10
        `),
        pool.query(`
            SELECT
                UPPER(TRIM(COALESCE(r.motivo, 'NAO INFORMADO'))) AS motivo,
                SUM(r.quantidade * COALESCE(pc.peso, r.peso_un, 0)) AS total
            FROM refugo_apontado_sync r
            LEFT JOIN pesos_customizados pc ON pc.codigo = r.codigo_peca
            WHERE r.batch_id = (SELECT batch_id FROM refugos_sync_batches WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1)
              AND r.data_refugo BETWEEN $1 AND $2
            GROUP BY 1
        `, [start, end]),
        pool.query(`
            SELECT
                UPPER(TRANSLATE(TRIM(t.setor), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) AS setor,
                SUM(t.quantidade * COALESCE(NULLIF(t.peso_un, 0), pc.peso, p.peso, 0)) AS total
            FROM producao_apontada_sincronizada t
            LEFT JOIN pesos_customizados pc ON pc.codigo = t.codigo_peca
            LEFT JOIN produto_pesos_producao p ON p.codigo_peca = t.codigo_peca
            WHERE t.data_producao BETWEEN $1 AND $2
              AND TRIM(t.codigo_peca) NOT IN ('18358', '801032102')
            GROUP BY 1
        `, [start, end]),
        pool.query('SELECT meta_peso FROM metas_faturamento WHERE mes_ano = $1', [start.slice(0, 7)])
    ]);
    let totalKg = 0, previousTotalKg = 0;
    const daily = [];
    fat.rows.forEach(row => {
        const peso = Number(row.total || 0);
        const data = row.data instanceof Date ? row.data.toISOString().slice(0, 10) : String(row.data).slice(0, 10);
        if (data.slice(0, 7) === start.slice(0, 7)) {
            totalKg += peso;
            daily.push({ data, pesoTotal: peso });
        } else previousTotalKg += peso;
    });
    const topClientes = carteira.rows.map(row => ({ cliente: row.cliente, pesoKg: Number(row.peso_kg || 0), pedidosUnicos: 0 }));
    const refugoByMotive = Object.fromEntries(refugo.rows.map(row => [row.motivo, Number(row.total || 0)]));
    const refugoTotalKg = Object.values(refugoByMotive).reduce((total, peso) => total + peso, 0);
    const producaoTotals = {
        'MOLDAGEM GERAL': 0, 'MOLDAGEM LEVE': 0, 'MOLDAGEM MANUAL': 0, 'MOLDAGEM PESADA': 0,
        FUSAO: 0, ACABAMENTO: 0, 'TRATAMENTO TERMICO': 0, 'USINAGEM EXPEDICAO': 0,
        'INSPECAO DE QUALIDADE': 0, EXPEDICAO: 0
    };
    producao.rows.forEach(row => {
        const setor = String(row.setor || '');
        const peso = Number(row.total || 0);
        const normalizado = setor === 'FUNDICAO' ? 'FUSAO'
            : setor === 'TT' ? 'TRATAMENTO TERMICO'
            : setor === 'QUALIDADE' ? 'INSPECAO DE QUALIDADE'
            : setor === 'USINAGEM' || setor === '50' ? 'USINAGEM EXPEDICAO'
            : setor === 'REBARBACAO' ? 'ACABAMENTO' : setor;
        if (['MOLDAGEM LEVE', 'MOLDAGEM MANUAL', 'MOLDAGEM PESADA'].includes(normalizado)) {
            producaoTotals[normalizado] += peso;
            producaoTotals['MOLDAGEM GERAL'] += peso;
        } else if (Object.prototype.hasOwnProperty.call(producaoTotals, normalizado)) {
            producaoTotals[normalizado] += peso;
        }
    });
    await publishDashboardSnapshot('global', {
        version: 'complete',
        faturamento: { totalKg, previousTotalKg, daily },
        meta: { pesoKg: Number(meta.rows[0]?.meta_peso || 0) },
        carteira: { totalKg: Number(carteira.rows[0]?.total_kg || 0), topClientes },
        refugo: { totalKg: refugoTotalKg, scrapPct: 0, byMotive: refugoByMotive },
        producao: { totals: producaoTotals }
    });
}

if (require.main === module) {
    refreshDashboardSnapshot().then(() => console.log('Snapshot atualizado.')).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
}

module.exports = { refreshDashboardSnapshot };
