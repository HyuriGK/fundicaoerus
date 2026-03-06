const pool = require('../lib/db');

async function checkData() {
    try {
        console.log('--- SYNC PEDIDOS KEYS ---');
        const sync = await pool.query("SELECT data FROM firebird_sync_pedidos LIMIT 1");
        if (sync.rows.length > 0) {
            console.log(Object.keys(sync.rows[0].data).filter(k => k.includes('PEDID') || k.includes('CODIGO') || k.includes('OP')));
        }

        console.log('\n--- SAMPLE ROW ---');
        const row = await pool.query("SELECT data FROM firebird_sync_pedidos WHERE data->>'OP_PCS' IS NOT NULL LIMIT 1");
        if (row.rows.length > 0) {
            const d = row.rows[0].data;
            console.log({
                OP_PCS: d.OP_PCS,
                CODIGO_PPR: d.CODIGO_PPR,
                PEDIDO_PPR: d.PEDIDO_PPR,
                PEDIDO_CLIENTE_PPR: d.PEDIDO_CLIENTE_PPR,
                PRODUTO_PPR: d.PRODUTO_PPR,
                NOME_CLIENTE: d.NOME_CLIENTE
            });
        }

        console.log('\n--- CARTEIRA SAMPLE ---');
        const cart = await pool.query("SELECT * FROM carteira LIMIT 3");
        console.table(cart.rows);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkData();
