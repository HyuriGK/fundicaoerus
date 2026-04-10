const { Pool } = require('pg');
const uri = "postgresql://neondb_owner:npg_qYnfKai9X4cx@ep-still-recipe-ah0lg56g-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const pool = new Pool({ connectionString: uri });

async function checkSyncTimes() {
    try {
        const query = `
            SELECT 
                'firebird_sync_pedidos' as table_name,
                MAX(updated_at) as last_sync
            FROM firebird_sync_pedidos
            UNION ALL
            SELECT 
                'firebird_sync_emissoes' as table_name,
                MAX(updated_at) as last_sync
            FROM firebird_sync_emissoes
        `;
        const res = await pool.query(query);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkSyncTimes();
