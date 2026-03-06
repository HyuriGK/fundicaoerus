const pool = require('../lib/db');

async function testJoin() {
    try {
        console.log('--- JOIN BY PEDIDO AND PRODUTO ---');
        const res = await pool.query(`
            SELECT 
                p.data->>'OP_PCS' as op,
                p.data->>'CODIGO_PPR' as pedido,
                p.data->>'PRODUTO_PPR' as produto,
                c.pedido as carteira_pedido,
                c.codigo as carteira_produto
            FROM firebird_sync_pedidos p
            INNER JOIN carteira c ON 
                (p.data->>'CODIGO_PPR') = c.pedido AND
                (p.data->>'PRODUTO_PPR') = c.codigo
            LIMIT 10
        `);
        console.table(res.rows);

        const count = await pool.query(`
            SELECT COUNT(*)
            FROM firebird_sync_pedidos p
            INNER JOIN carteira c ON 
                (p.data->>'CODIGO_PPR') = c.pedido AND
                (p.data->>'PRODUTO_PPR') = c.codigo
        `);
        console.log('Total Joined:', count.rows[0].count);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

testJoin();
