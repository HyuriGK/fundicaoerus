const pool = require('../lib/db');

async function checkCounts() {
    try {
        const cartCount = await pool.query("SELECT COUNT(*) FROM carteira");
        const syncCount = await pool.query("SELECT COUNT(*) FROM firebird_sync_pedidos");

        console.log({
            carteira_total: cartCount.rows[0].count,
            sync_total: syncCount.rows[0].count
        });

        // Check for specific OPs the user might be expecting
        // Let's look at the most recent OPs in sync table
        const recentSync = await pool.query("SELECT data->>'OP_PCS' as op, data->>'CODIGO_PPR' as pedido, data->>'NOME_CLIENTE' as cliente FROM firebird_sync_pedidos ORDER BY updated_at DESC LIMIT 10");
        console.log('\n--- RECENT SYNCED OPS ---');
        console.table(recentSync.rows);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkCounts();
