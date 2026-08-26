const pool = require('../../lib/db');
const { publishDashboardSnapshot } = require('../../lib/dashboard-snapshot');

async function refreshDashboardSnapshot() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const [fat, carteira, refugo, producao, meta] = await Promise.all([
        pool.query("SELECT data_faturamento::date data,SUM(COALESCE(NULLIF(peso_un,0),0)*COALESCE(quantidade,0)) total FROM faturamento_firebird WHERE data_faturamento BETWEEN $1 AND $2 AND gera_financeiro IS DISTINCT FROM 'N' AND COALESCE(excluido_manualmente,false)=false GROUP BY 1 ORDER BY 1", [previousStart,end]),
        pool.query(`
            WITH base AS (
                SELECT
                    UPPER(TRIM(COALESCE(p.data->>'NOME_CLIENTE', 'Desconhecido'))) AS cliente,
                    GREATEST(0,
                        COALESCE(CASE WHEN p.data->>'SALDO_LIBERADO_FATURAR_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'SALDO_LIBERADO_FATURAR_PPR', ',', '.')::numeric END, 0),
                        COALESCE(CASE WHEN p.data->>'QUANTIDADE_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_PPR', ',', '.')::numeric END, 0)
                        - COALESCE(CASE WHEN p.data->>'QUANTIDADE_FATURADA_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_FATURADA_PPR', ',', '.')::numeric END, 0)
                        - COALESCE(CASE WHEN p.data->>'QUANTIDADE_DESISTENCIA_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_DESISTENCIA_PPR', ',', '.')::numeric END, 0)
                    ) AS saldo,
                    COALESCE(
                        NULLIF(f.peso_liquido_pro, 0),
                        NULLIF(CASE WHEN p.data->>'PESO_UNIT' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'PESO_UNIT', ',', '.')::numeric END, 0),
                        NULLIF(CASE WHEN p.data->>'PESO_PRODUTO' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'PESO_PRODUTO', ',', '.')::numeric END, 0),
                        pc.peso, 0
                    ) AS peso_unit
                FROM firebird_sync_emissoes p
                LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = p.data->>'PRODUTO_PPR'
                LEFT JOIN pesos_customizados pc ON pc.codigo = TRIM(p.data->>'PRODUTO_PPR')
                WHERE (COALESCE(CASE WHEN p.data->>'QUANTIDADE_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_PPR', ',', '.')::numeric END, 0)
                    - COALESCE(CASE WHEN p.data->>'QUANTIDADE_FATURADA_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_FATURADA_PPR', ',', '.')::numeric END, 0)
                    - COALESCE(CASE WHEN p.data->>'QUANTIDADE_DESISTENCIA_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_DESISTENCIA_PPR', ',', '.')::numeric END, 0)) > 0
                  AND p.data->>'STATUS_PPR' <> 'C'
                  AND RIGHT(TRIM(p.data->>'PRODUTO_PPR'), 1) <> '1'
                  AND UPPER(TRIM(COALESCE(p.data->>'FATURADO_PPR', ''))) <> 'T'
            ), por_cliente AS (
                SELECT cliente, SUM(saldo * peso_unit) AS peso_kg
                FROM base GROUP BY cliente
            )
            SELECT cliente, peso_kg, SUM(peso_kg) OVER () AS total_kg
            FROM por_cliente ORDER BY peso_kg DESC LIMIT 10
        `),
        pool.query("SELECT SUM(r.quantidade * COALESCE(pc.peso, r.peso_un, 0)) total FROM refugo_apontado_sync r LEFT JOIN pesos_customizados pc ON pc.codigo = r.codigo_peca WHERE r.batch_id=(SELECT batch_id FROM refugos_sync_batches WHERE status='completed' ORDER BY completed_at DESC LIMIT 1) AND r.data_refugo BETWEEN $1 AND $2", [start,end]),
        pool.query("SELECT UPPER(TRIM(setor)) setor,SUM(quantidade*COALESCE(peso_un,0)) total FROM producao_apontada_sincronizada WHERE data_producao BETWEEN $1 AND $2 GROUP BY 1", [start,end]),
        pool.query('SELECT meta_peso FROM metas_faturamento WHERE mes_ano = $1', [start.slice(0, 7)])
    ]);
    let totalKg = 0, previousTotalKg = 0;
    const daily = [];
    fat.rows.forEach(row => { const peso = Number(row.total || 0); if (String(row.data).slice(0, 7) === start.slice(0, 7)) { totalKg += peso; daily.push({ data: String(row.data).slice(0, 10), pesoTotal: peso }); } else previousTotalKg += peso; });
    const topClientes = carteira.rows.map(row => ({ cliente: row.cliente, pesoKg: Number(row.peso_kg || 0), pedidosUnicos: 0 }));
    await publishDashboardSnapshot('global', {
        version: 'complete',
        faturamento: { totalKg, previousTotalKg, daily },
        meta: { pesoKg: Number(meta.rows[0]?.meta_peso || 0) },
        carteira: { totalKg: Number(carteira.rows[0]?.total_kg || 0), topClientes },
        refugo: { totalKg: Number(refugo.rows[0].total || 0), scrapPct: 0, byMotive: {} },
        producao: { totals: Object.fromEntries(producao.rows.map(row => [row.setor, Number(row.total || 0)])) }
    });
}

if (require.main === module) {
    refreshDashboardSnapshot().then(() => console.log('Snapshot atualizado.')).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
}

module.exports = { refreshDashboardSnapshot };
