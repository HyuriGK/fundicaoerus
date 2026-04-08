const pool = require('./lib/db');
require('dotenv').config({ path: '.env.local' });

async function check() {
    try {
        const res = await pool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'firebird_sync_pedidos')");
        console.log('Table firebird_sync_pedidos exists:', res.rows[0].exists);
        
        if (res.rows[0].exists) {
            const count = await pool.query("SELECT COUNT(*) FROM firebird_sync_pedidos");
            console.log('Record count:', count.rows[0].count);
        }
    } catch (e) {
        console.error('Error checking Postgres:', e.message);
    } finally {
        await pool.end();
    }
}

check();
