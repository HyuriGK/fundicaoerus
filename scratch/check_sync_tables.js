const pool = require('../lib/db');

async function checkTables() {
    try {
        console.log('--- Checking firebird_sync_pedidos ---');
        const resPedidos = await pool.query('SELECT COUNT(*) FROM firebird_sync_pedidos');
        console.log('Count:', resPedidos.rows[0].count);
        const lastUpdatePedidos = await pool.query('SELECT MAX(updated_at) FROM firebird_sync_pedidos');
        console.log('Last Sync:', lastUpdatePedidos.rows[0].max);

        console.log('\n--- Checking firebird_sync_emissoes ---');
        const resEmissoes = await pool.query('SELECT COUNT(*) FROM firebird_sync_emissoes');
        console.log('Count:', resEmissoes.rows[0].count);
        const lastUpdateEmissoes = await pool.query('SELECT MAX(updated_at) FROM firebird_sync_emissoes');
        console.log('Last Sync:', lastUpdateEmissoes.rows[0].max);

        console.log('\n--- Checking firebird_sync_dados ---');
        const resDados = await pool.query('SELECT COUNT(*) FROM firebird_sync_dados');
        console.log('Count:', resDados.rows[0].count);
        
        console.log('\n--- Sample data from firebird_sync_emissoes ---');
        const sample = await pool.query('SELECT data FROM firebird_sync_emissoes LIMIT 1');
        console.log(JSON.stringify(sample.rows[0]?.data, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkTables();
