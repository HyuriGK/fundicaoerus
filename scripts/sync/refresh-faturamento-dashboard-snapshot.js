const pool = require('../../lib/db');
const { getDashboardSnapshot, publishDashboardSnapshot } = require('../../lib/dashboard-snapshot');

(async () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const result = await pool.query(`
        WITH fat_peso_overrides AS (
            SELECT fp.item_key, fp.item_value::boolean AS fat_peso
            FROM app_preferences p CROSS JOIN LATERAL jsonb_each_text(COALESCE(p.value, '{}'::jsonb)) fp(item_key, item_value)
            WHERE p.key = 'fat_peso_overrides'
        ), base AS (
            SELECT f.data_faturamento::date AS data,
                CASE WHEN o.fat_peso IS NOT NULL THEN o.fat_peso WHEN f.gera_financeiro = 'N' THEN false ELSE NOT COALESCE(pref.excluido, f.excluido_manualmente, false) END AS fat_peso,
                COALESCE(NULLIF(f.peso_un, 0), pc.peso, 0) * COALESCE(f.quantidade, 0) AS peso_total
            FROM faturamento_firebird f
            LEFT JOIN faturamento_firebird_preferencias pref ON pref.nota_fiscal = f.nota_fiscal AND pref.codigo_item IS NOT DISTINCT FROM CAST(TRIM(f.codigo_item) AS VARCHAR) AND COALESCE(pref.pedido, '') = COALESCE(TRIM(f.pedido), '') AND pref.data_faturamento = f.data_faturamento AND pref.quantidade = f.quantidade
            LEFT JOIN pesos_customizados pc ON pc.codigo = TRIM(f.codigo_item)
            LEFT JOIN fat_peso_overrides o ON o.item_key = CONCAT(f.nota_fiscal, '-', COALESCE(TRIM(f.codigo_item), ''), '-', COALESCE(TRIM(f.pedido), ''), '-', f.data_faturamento::date, '-', COALESCE(f.quantidade, 0))
            WHERE f.data_faturamento BETWEEN $1 AND $2
              AND f.cliente_codigo::text NOT IN ('257', '432', '2020', '316', '2283', '253')
              AND UPPER(TRIM(COALESCE(f.cliente_nome, ''))) NOT LIKE '%IMEPEL INDUSTRIA MECANICA LTDA%'
              AND UPPER(TRIM(COALESCE(f.cliente_nome, ''))) NOT LIKE '%STEELROOL INDUSTRIA METALURGICA%'
              AND UPPER(TRIM(COALESCE(f.cliente_nome, ''))) NOT LIKE '%SPILROD FUNDICAO DE FERRO E ACO LTDA%'
        ) SELECT data, SUM(CASE WHEN fat_peso THEN peso_total ELSE 0 END) AS total FROM base GROUP BY data ORDER BY data
    `, [start, end]);
    const daily = result.rows.map(row => ({ data: row.data instanceof Date ? row.data.toISOString().slice(0, 10) : String(row.data).slice(0, 10), pesoTotal: Number(row.total || 0) }));
    const faturamento = { sync: true, totalKg: daily.reduce((total, item) => total + item.pesoTotal, 0), daily };
    const globalSnapshot = await getDashboardSnapshot('global');
    if (globalSnapshot?.payload) await publishDashboardSnapshot('global', { ...globalSnapshot.payload, faturamento });
    await publishDashboardSnapshot('faturamento', faturamento);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
