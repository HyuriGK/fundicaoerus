const { Pool } = require('pg');
const uri = "postgresql://neondb_owner:npg_qYnfKai9X4cx@ep-still-recipe-ah0lg56g-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const pool = new Pool({ connectionString: uri });

async function checkColumns() {
    try {
        const query = `
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'firebird_sync_pedidos'
        `;
        const res = await pool.query(query);
        console.log(res.rows.map(r => r.column_name).join(', '));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkColumns();
