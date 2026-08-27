const pool = require('../../lib/db');
const { publishDashboardSnapshot } = require('../../lib/dashboard-snapshot');
const { getCorrectedWeight } = require('../../public/js/shared-utils');

(async () => {
    const [pedidosResult, linksResult, closedOpsResult, produtoPesoResult, customWeightsResult] = await Promise.all([
        pool.query(`
            SELECT p.sync_key, p.data, p.updated_at, f.data_fic, f.pro_codigo_fic AS has_ficha,
                   f.peso_liquido_pro AS ficha_peso_liquido_pro
            FROM firebird_sync_emissoes p
            LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = p.data->>'PRODUTO_PPR'
            WHERE ((p.data->>'QUANTIDADE_PPR')::numeric
                    - COALESCE((p.data->>'QUANTIDADE_FATURADA_PPR')::numeric, 0)
                    - COALESCE((p.data->>'QUANTIDADE_DESISTENCIA_PPR')::numeric, 0)) > 0
              AND (p.data->>'STATUS_PPR') <> 'C'
              AND COALESCE(p.data->>'STATUS_PCP', '') NOT IN ('C', 'E', 'F')
            ORDER BY (f.pro_codigo_fic IS NOT NULL) DESC, f.data_fic DESC NULLS LAST, p.updated_at DESC
            LIMIT 1500
        `),
        pool.query('SELECT sync_key, op, status FROM pedidos_op_links'),
        pool.query(`SELECT data->>'OP_PCS' AS op FROM firebird_sync_pedidos
                    WHERE sync_key LIKE 'OP-%' AND COALESCE(data->>'STATUS_PCP', '') IN ('C', 'E', 'F')`),
        pool.query(`SELECT data->>'PRODUTO_PPR' AS produto, data->>'PESO_PRODUTO' AS peso_produto
                    FROM firebird_sync_pedidos WHERE sync_key LIKE 'OP-%'
                      AND NULLIF(data->>'PRODUTO_PPR', '') IS NOT NULL
                      AND NULLIF(data->>'PESO_PRODUTO', '') IS NOT NULL`),
        pool.query('SELECT codigo, peso FROM pesos_customizados')
    ]);

    const links = Object.fromEntries(linksResult.rows.map(row => [row.sync_key, row]));
    const closedOps = new Set(closedOpsResult.rows.map(row => String(row.op || '').trim()).filter(Boolean));
    const produtoPesos = {};
    produtoPesoResult.rows.forEach(row => {
        const produto = String(row.produto || '').trim();
        if (produto && !produtoPesos[produto]) produtoPesos[produto] = Number(row.peso_produto);
    });
    const customWeights = Object.fromEntries(customWeightsResult.rows.map(row => [row.codigo, Number(row.peso)]));

    const pedidos = pedidosResult.rows.map(row => {
        const item = { ...row.data, sync_key: row.sync_key };
        const manualLink = links[row.sync_key];
        if (manualLink?.status === 'confirmado') {
            item.LINK_STATUS = 'confirmado';
            item.OP_PCS = manualLink.op;
        } else if ((manualLink?.status === 'rejeitado' || manualLink?.status === 'removido') && item.LINK_STATUS !== 'oficial') {
            item.LINK_STATUS = manualLink.status;
            item.OP_PCS = null;
        }
        const produto = String(item.PRODUTO_PPR || '').trim();
        if (Number(row.ficha_peso_liquido_pro) > 0) item.PESO_PRODUTO = Number(row.ficha_peso_liquido_pro);
        if ((!item.PESO_PRODUTO || Number(item.PESO_PRODUTO) <= 0) && produtoPesos[produto]) item.PESO_PRODUTO = produtoPesos[produto];
        if (item.LINK_STATUS === 'sugerido' && !/^\d{1,4}$/.test(String(item.OP_PCS || '').trim())) {
            item.LINK_STATUS = null;
            item.OP_PCS = null;
        }
        return item;
    }).filter(item => !closedOps.has(String(item.OP_PCS || '').trim()));

    const clientes = new Map();
    pedidos.forEach(item => {
        const cliente = String(item.NOME_CLIENTE || 'Desconhecido').trim().toUpperCase() || 'DESCONHECIDO';
        const atual = clientes.get(cliente) || { pesoKg: 0, pedidos: new Set() };
        atual.pesoKg += getCorrectedWeight(item, customWeights);
        if (item.CODIGO_PPR) atual.pedidos.add(String(item.CODIGO_PPR));
        clientes.set(cliente, atual);
    });

    const topClientes = [...clientes.entries()]
        .map(([cliente, data]) => ({ cliente, pesoKg: data.pesoKg, pedidosUnicos: data.pedidos.size }))
        .sort((a, b) => b.pesoKg - a.pesoKg)
        .slice(0, 10);
    const totalKg = [...clientes.values()].reduce((total, data) => total + data.pesoKg, 0);

    await publishDashboardSnapshot('carteira', { sync: true, totalKg, topClientes });
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
