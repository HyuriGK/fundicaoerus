
const pool = require('./lib/db');

async function checkColumns() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'refugo_apontado_sincronizado'
            ORDER BY ordinal_position;
        `);
        console.log("Columns for 'refugo_apontado_sincronizado':");
        res.rows.forEach(row => {
            console.log(`${row.column_name} (${row.data_type})`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}
checkColumns();
