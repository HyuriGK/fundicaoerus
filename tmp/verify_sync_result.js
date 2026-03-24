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
        console.log('--- Verificando Pedido 56, Item 1, Ano 2025 ---');
        const res = await pool.query(`
            SELECT data 
            FROM firebird_sync_pedidos 
            WHERE data->>'CODIGO_PPR' = '56' 
              AND data->>'ITEM_PPR' = '1' 
              AND data->>'ANO_PPR' = '2025'
        `);

        if (res.rows.length > 0) {
            console.log('Dados sincronizados:', JSON.stringify(res.rows[0].data, null, 2));
        } else {
            console.log('Pedido 56 não encontrado.');
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

verify();
