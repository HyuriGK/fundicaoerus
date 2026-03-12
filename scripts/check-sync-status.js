const pool = require('../lib/db');

async function check() {
    try {
        const res = await pool.query('SELECT * FROM sync_status');
        console.table(res.rows);
        
        const tasksRes = await pool.query(`
            SELECT 
                screen_name, 
                last_sync_at,
                EXTRACT(EPOCH FROM (NOW() - last_sync_at))/3600 as hours_diff
            FROM sync_status
        `);
        console.log('Hours Diff Check:');
        console.table(tasksRes.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
