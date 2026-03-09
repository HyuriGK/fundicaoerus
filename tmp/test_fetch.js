const pool = require('../lib/db');

async function testFetch() {
    try {
        const query = `
            SELECT 
                p.sync_key, 
                p.data
            FROM firebird_sync_pedidos p
            INNER JOIN (
                SELECT DISTINCT pedido, codigo FROM carteira
            ) c ON (p.data->>'CODIGO_PPR') = c.pedido AND (p.data->>'PRODUTO_PPR') = c.codigo
            LIMIT 5
        `;
        const res = await pool.query(query);
        console.table(res.rows.map(r => ({
            op: r.data.OP_PCS,
            nome_prod: r.data.NOME_PRODUTO_PPR,
            prod: r.data.PRODUTO_PPR,
            qty_op: r.data.OP_QUANTIDADE,
            qty_ppr: r.data.QUANTIDADE_PPR,
            cliente: r.data.NOME_CLIENTE
        })));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
testFetch();
