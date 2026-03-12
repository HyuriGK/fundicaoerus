const pool = require('../lib/db');

async function setupTest() {
    try {
        console.log('Inserting test data into sync_status...');
        
        // 1. Pedidos: Recent (0 minutes ago)
        await pool.query(`
            INSERT INTO sync_status (screen_name, last_sync_at)
            VALUES ('Pedidos', NOW())
            ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
        `);
        
        // 2. Faturamento: Outdated (3 hours ago)
        await pool.query(`
            INSERT INTO sync_status (screen_name, last_sync_at)
            VALUES ('Faturamento', NOW() - INTERVAL '3 hours')
            ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW() - INTERVAL '3 hours';
        `);
        
        console.log('✅ Test data inserted.');
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

setupTest();
