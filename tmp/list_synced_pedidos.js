require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
function cleanConnectionString(str) { if (!str) return ''; let cleaned = str.trim(); if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim(); return cleaned.replace(/^['"]|['"]$/g, ''); }
const pool = new Pool({ connectionString: cleanConnectionString(process.env.DATABASE_URL), ssl: { rejectUnauthorized: false } });

async function list() {
    try {
        const res = await pool.query("SELECT data->>'CODIGO_PPR' as p, data->>'ITEM_PPR' as i, data->>'ANO_PPR' as a, data->>'OP_PCS' as op FROM firebird_sync_pedidos LIMIT 20");
        console.log(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
list();
