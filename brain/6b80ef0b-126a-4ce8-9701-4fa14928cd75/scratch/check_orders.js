const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

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

async function checkItem() {
    try {
        const query = `
            SELECT 
                sync_key, 
                data->>'CODIGO_PPR' as pedido, 
                data->>'ANO_PPR' as ano,
                data->>'ITEM_PPR' as item,
                data->>'EMPRESA_PPR' as empresa,
                data->>'QUANTIDADE_PPR' as qtd, 
                data->>'QUANTIDADE_FATURADA_PPR' as qtd_fat,
                data->>'OP_PCS' as op 
            FROM firebird_sync_emissoes 
            WHERE data->>'PRODUTO_PPR' = '225006400';
        `;
        const res = await pool.query(query);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkItem();
