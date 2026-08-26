const pool = require('../../lib/db');
const { getDashboardSnapshot, publishDashboardSnapshot } = require('../../lib/dashboard-snapshot');

(async () => {
    const result = await pool.query(`
        WITH base AS (
            SELECT
                UPPER(TRIM(COALESCE(p.data->>'NOME_CLIENTE', 'Desconhecido'))) AS cliente,
                NULLIF(TRIM(COALESCE(p.data->>'CODIGO_PPR', p.data->>'PEDIDO_PPR', p.data->>'NUMERO_PEDIDO', '')), '') AS pedido,
                GREATEST(0,
                    COALESCE(CASE WHEN p.data->>'SALDO_LIBERADO_FATURAR_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'SALDO_LIBERADO_FATURAR_PPR', ',', '.')::numeric END, 0),
                    COALESCE(CASE WHEN p.data->>'QUANTIDADE_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_PPR', ',', '.')::numeric END, 0)
                    - COALESCE(CASE WHEN p.data->>'QUANTIDADE_FATURADA_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_FATURADA_PPR', ',', '.')::numeric END, 0)
                    - COALESCE(CASE WHEN p.data->>'QUANTIDADE_DESISTENCIA_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_DESISTENCIA_PPR', ',', '.')::numeric END, 0)
                ) AS saldo,
                COALESCE(NULLIF(f.peso_liquido_pro, 0), NULLIF(CASE WHEN p.data->>'PESO_UNIT' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'PESO_UNIT', ',', '.')::numeric END, 0), NULLIF(CASE WHEN p.data->>'PESO_PRODUTO' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'PESO_PRODUTO', ',', '.')::numeric END, 0), pc.peso, 0) AS peso_unit
            FROM firebird_sync_emissoes p
            LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = p.data->>'PRODUTO_PPR'
            LEFT JOIN pesos_customizados pc ON pc.codigo = TRIM(p.data->>'PRODUTO_PPR')
            WHERE (COALESCE(CASE WHEN p.data->>'QUANTIDADE_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_PPR', ',', '.')::numeric END, 0) - COALESCE(CASE WHEN p.data->>'QUANTIDADE_FATURADA_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_FATURADA_PPR', ',', '.')::numeric END, 0) - COALESCE(CASE WHEN p.data->>'QUANTIDADE_DESISTENCIA_PPR' ~ '^-?[0-9]+([.,][0-9]+)?$' THEN REPLACE(p.data->>'QUANTIDADE_DESISTENCIA_PPR', ',', '.')::numeric END, 0)) > 0
              AND p.data->>'STATUS_PPR' <> 'C' AND RIGHT(TRIM(p.data->>'PRODUTO_PPR'), 1) <> '1' AND UPPER(TRIM(COALESCE(p.data->>'FATURADO_PPR', ''))) <> 'T'
        ), por_cliente AS (
            SELECT cliente, SUM(saldo * peso_unit) AS peso_kg, COUNT(DISTINCT pedido) FILTER (WHERE pedido IS NOT NULL) AS pedidos_unicos FROM base GROUP BY cliente
        )
        SELECT cliente, peso_kg, pedidos_unicos, SUM(peso_kg) OVER () AS total_kg FROM por_cliente ORDER BY peso_kg DESC LIMIT 10
    `);
    const carteira = { sync: true, totalKg: Number(result.rows[0]?.total_kg || 0), topClientes: result.rows.map(row => ({ cliente: row.cliente, pesoKg: Number(row.peso_kg || 0), pedidosUnicos: Number(row.pedidos_unicos || 0) })) };
    const globalSnapshot = await getDashboardSnapshot('global');
    if (globalSnapshot?.payload) await publishDashboardSnapshot('global', { ...globalSnapshot.payload, carteira });
    await publishDashboardSnapshot('carteira', carteira);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
