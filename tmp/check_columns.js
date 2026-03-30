const pool = require('c:/Users/brasi/Desktop/server/lib/db');
async function run() {
    try {
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'ficha_tecnica'");
        console.log(res.rows.map(r => r.column_name));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
