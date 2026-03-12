const pool = require('../lib/db');

async function checkTime() {
    try {
        const res = await pool.query("SELECT NOW() as db_now, CURRENT_SETTING('TIMEZONE') as db_timezone");
        console.log('Database Time Info:');
        console.table(res.rows);
        
        const syncRes = await pool.query("SELECT screen_name, last_sync_at, NOW() - last_sync_at as raw_diff FROM sync_status");
        console.log('Sync Status Info:');
        console.table(syncRes.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

checkTime();
