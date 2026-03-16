const pool = require('../lib/db');
(async () => {
    try {
        const res = await pool.query("SELECT data FROM firebird_sync_pedidos WHERE (data->>'OP_PCS') = '3945' OR (data->>'CODIGO_PPR') = '3945' LIMIT 1");
        if (res.rows.length > 0) {
            console.log(JSON.stringify(res.rows[0].data, null, 2));
        } else {
            console.log('Nenhum registro encontrado para OP 3951.');
            // Let's list some keys to see if the table has data
            const res2 = await pool.query("SELECT data->>'OP_PCS' as op FROM firebird_sync_pedidos LIMIT 10");
            console.log('Algumas OPs na tabela:', res2.rows.map(r => r.op));
        }
    } catch (err) {
        console.error('Erro:', err);
    }
    process.exit(0);
})();
