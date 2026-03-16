const pool = require('../lib/db');
(async () => {
    try {
        // Check OP 3945
        const res3945 = await pool.query("SELECT data->>'QTY_MOLDADA' as qty_moldada, data->>'QTY_FUSAO' as qty_fusao FROM firebird_sync_pedidos WHERE data->>'OP_PCS' = '3945'");
        console.log('OP 3945:', JSON.stringify(res3945.rows, null, 2));

        // Check OP 3951
        const res3951 = await pool.query("SELECT data->>'QTY_MOLDADA' as qty_moldada, data->>'QTY_FUSAO' as qty_fusao FROM firebird_sync_pedidos WHERE data->>'OP_PCS' = '3951'");
        console.log('OP 3951:', JSON.stringify(res3951.rows, null, 2));
    } catch (err) {
        console.error('Erro:', err);
    }
    process.exit(0);
})();
