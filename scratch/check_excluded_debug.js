const pool = require('../lib/db');

async function check() {
    try {
        const res = await pool.query("SELECT value FROM app_preferences WHERE key = 'excluded_clients'");
        console.log(JSON.stringify(res.rows[0]?.value || [], null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

check();
