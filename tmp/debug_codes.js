const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function debug() {
    let connectionString = process.env.DATABASE_URL;
    if (connectionString.startsWith("psql '")) {
        connectionString = connectionString.substring(6, connectionString.length - 1);
    }
    const pool = new Pool({ connectionString });
    try {
        console.log('--- AMOSTRA DE DADOS (API ORDER) ---');
        const res = await pool.query(`
            SELECT 
                (data->>'CODIGO_PPR') as ped, 
                (data->>'PRODUTO_PPR') as cod, 
                (data->>'NOME_PRODUTO_PPR') as desc,
                f.data_fic
            FROM firebird_sync_pedidos p
            LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
            ORDER BY 
                (f.pro_codigo_fic IS NOT NULL) DESC,
                f.data_fic DESC NULLS LAST,
                p.updated_at DESC
            LIMIT 10
        `);

        const results = res.rows.map(row => ({
            Pedido: row.ped,
            Produto: row.cod,
            Descricao: row.desc.substring(0, 35) + '...',
            Data_Ficha: row.data_fic || 'Sem Ficha'
        }));

        console.table(results);

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

debug();
