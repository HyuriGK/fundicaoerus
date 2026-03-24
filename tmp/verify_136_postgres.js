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

async function verify() {
    try {
        const res = await pool.query(`
            SELECT data 
            FROM firebird_sync_pedidos 
            WHERE data->>'CODIGO_PPR' = '136' 
              AND data->>'ITEM_PPR' = '1' 
              AND data->>'ANO_PPR' = '2026'
        `);

        if (res.rows.length > 0) {
            console.log('Dados no Postgres para Pedido 136/1/2026:');
            console.log(JSON.stringify(res.rows[0].data, null, 2));
        } else {
            console.log('Pedido 136 não encontrado.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

verify();
