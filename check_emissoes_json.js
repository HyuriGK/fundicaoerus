const pool = require('./lib/db');
async function test() {
    try {
        const query = `
            SELECT data 
            FROM firebird_sync_emissoes 
            WHERE data->>'OP_PCS' IS NOT NULL 
            LIMIT 1
        `;
        const res = await pool.query(query);
        console.log(JSON.stringify(res.rows[0].data, null, 2));
    } catch(e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
test();
