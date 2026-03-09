const pool = require('../lib/db');

async function testFetchAll() {
    try {
        const query = `
            SELECT 
                p.sync_key, 
                p.data
            FROM firebird_sync_pedidos p
            INNER JOIN (
                SELECT DISTINCT pedido, codigo FROM carteira
            ) c ON (p.data->>'CODIGO_PPR') = c.pedido AND (p.data->>'PRODUTO_PPR') = c.codigo
            WHERE (p.data->>'OP_PCS') IS NOT NULL AND (p.data->>'OP_PCS') <> ''
        `;
        const res = await pool.query(query);
        let missingDesc = 0;
        let missingQty = 0;

        for (const r of res.rows) {
            const op = r.data.OP_PCS;
            const desc = r.data.NOME_PRODUTO_PPR || r.data.PRODUTO_PPR;
            const qty = parseInt(r.data.OP_QUANTIDADE) || parseInt(r.data.QUANTIDADE_PPR) || 0;

            if (!desc) { missingDesc++; console.log('Missing Desc for OP:', op); }
            if (!qty) { missingQty++; console.log('Missing Qty for OP:', op); }
        }

        console.log(`Total OPs with OP_PCS: ${res.rows.length}`);
        console.log(`Missing Description: ${missingDesc}`);
        console.log(`Missing Quantity: ${missingQty}`);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
testFetchAll();
