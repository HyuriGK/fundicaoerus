require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

function cleanConnectionString(str) {
    if (!str) return '';
    let cleaned = str.trim();
    if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim();
    return cleaned.replace(/^['"]|['"]$/g, '');
}

const pool = new Pool({
    connectionString: cleanConnectionString(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false }
});

async function find() {
    try {
        console.log('--- Buscando Pedidos com múltiplas OPs ---');
        // This is tricky because OP_PCS is just one value in the JSON now.
        // Wait, I didn't save the list of all OPs in the JSON!
        // I only saved the "Best" one in OP_PCS.
        
        // I should have saved the list of OPs in the JSON for verification.
        // Let's modify sync-data.js to include "ALL_OPS" for easier debugging and transparency.
        
        const res = await pool.query(`
            SELECT data->>'CODIGO_PPR' as ped, data->>'ITEM_PPR' as item, data->>'OP_PCS' as op, data->>'QTY_MOLDADA' as moldada
            FROM firebird_sync_pedidos 
            WHERE (data->>'QTY_MOLDADA')::float > 0
            LIMIT 10
        `);

        console.log('Amostra de pedidos com produção:', res.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

find();
