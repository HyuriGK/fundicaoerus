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
        console.log('--- Verificando Pedido 119 na CARTEIRA ---');
        const resCart = await pool.query("SELECT * FROM carteira WHERE pedido = '119'");
        console.log('Resultados na Carteira:', JSON.stringify(resCart.rows, null, 2));

        if (resCart.rows.length === 0) {
            console.log('AVISO: Pedido 119 NÃO encontrado na carteira. Por isso ele não aparece no monitoramento.');
        }

        console.log('\n--- Verificando JOIN no Postgres (Simulando API) ---');
        const resJoin = await pool.query(`
            SELECT p.data->>'OP_PCS' as op, p.data->>'NOME_CLIENTE' as cliente
            FROM firebird_sync_pedidos p
            INNER JOIN (SELECT DISTINCT pedido, codigo FROM carteira) c 
            ON (p.data->>'CODIGO_PPR') = c.pedido 
            AND (p.data->>'PRODUTO_PPR') = c.codigo
            WHERE (p.data->>'CODIGO_PPR') = '119'
        `);
        console.log('Resultado do JOIN:', JSON.stringify(resJoin.rows, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
