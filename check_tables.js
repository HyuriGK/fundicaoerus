
const pool = require('./lib/db');

async function checkTables() {
    try {
        const tables = ['pesos_customizados', 'produto_pesos_producao'];
        for (const table of tables) {
            try {
                const res = await pool.query(`SELECT COUNT(*) FROM ${table}`);
                console.log(`Table ${table}: ${res.rows[0].count} records`);
            } catch (e) {
                console.log(`Table ${table} error: ${e.message}`);
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
checkTables();
