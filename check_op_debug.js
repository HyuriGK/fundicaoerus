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

async function check() {
    try {
        console.log('--- Buscando por OP 3873 ---');
        const resOP = await pool.query("SELECT * FROM firebird_sync_pedidos WHERE data->>'OP_PCS' = '3873'");
        console.log('Resultados por OP:', JSON.stringify(resOP.rows, null, 2));

        console.log('\n--- Buscando por Pedido 119 ---');
        const resPed = await pool.query("SELECT * FROM firebird_sync_pedidos WHERE data->>'CODIGO_PPR' = '119'");
        if (resPed.rows.length > 0) {
            console.log('Pedido 119 encontrado. Dados do primeiro registro:', JSON.stringify(resPed.rows[0], null, 2));
        } else {
            console.log('Pedido 119 NÃO encontrado em firebird_sync_pedidos.');
        }

        const countTotal = await pool.query("SELECT count(*) FROM firebird_sync_pedidos");
        console.log('\nTotal de registros em firebird_sync_pedidos:', countTotal.rows[0].count);

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
