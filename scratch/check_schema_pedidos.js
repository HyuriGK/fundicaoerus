const { Pool } = require('pg');
const uri = "postgresql://neondb_owner:npg_qYnfKai9X4cx@ep-still-recipe-ah0lg56g-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const pool = new Pool({ connectionString: uri });

async function checkSchema() {
    try {
        const res = await pool.query("SELECT data FROM firebird_sync_pedidos LIMIT 1");
        if (res.rows.length > 0) {
            console.log(JSON.stringify(res.rows[0].data, null, 2));
        } else {
            console.log("No records found in firebird_sync_pedidos");
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkSchema();
