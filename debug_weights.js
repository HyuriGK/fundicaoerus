const pool = require('./lib/db');

async function debug() {
    try {
        const query = `
            SELECT 
                (p.data->>'CODIGO_PPR') as ped,
                (p.data->>'PRODUTO_PPR') as prod,
                (p.data->>'PESO_LIQUIDO_NPR') as peso_erp,
                (p.data->>'NOME_PRODUTO_PPR') as nome,
                pc.peso as peso_custom
            FROM firebird_sync_pedidos p
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            WHERE 
                CAST(COALESCE(NULLIF(p.data->>'PESO_LIQUIDO_NPR', ''), '0') AS NUMERIC) = 0
                AND pc.peso IS NULL
                AND NOT (TRIM(p.data->>'PRODUTO_PPR') LIKE '%1' AND TRIM(p.data->>'NOME_PRODUTO_PPR') LIKE 'MODELO %')
            LIMIT 50
        `;
        const res = await pool.query(query);
        console.log('--- ITENS COM PESO ZERO (STRICT MODEL FILTER) ---');
        console.table(res.rows);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debug();
