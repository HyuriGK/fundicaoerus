require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

function cleanConnectionString(str) {
    if (!str) return '';
    let cleaned = str.trim();
    if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim();
    return cleaned.replace(/^['"]|['"]$/g, '');
}

async function checkOP() {
    const pool = new Pool({
        connectionString: cleanConnectionString(process.env.DATABASE_URL),
        ssl: { rejectUnauthorized: false }
    });

    try {
        const res = await pool.query("SELECT sync_key, data->'QTY_USINAGEM' as qty_usi, data->'OP_PCS' as op, data->'QTY_EXPEDICAO' as qty_exp FROM firebird_sync_pedidos WHERE data->>'OP_PCS' = '3569';");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkOP();
