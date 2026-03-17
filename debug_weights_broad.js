const pool = require('./lib/db');

async function debug() {
    try {
        const query = `
            SELECT 
                (data->>'CODIGO_PPR') as ped,
                (data->>'PRODUTO_PPR') as prod,
                (data->>'PESO_LIQUIDO_NPR') as peso_erp,
                (data->>'NOME_PRODUTO_PPR') as nome
            FROM firebird_sync_pedidos
            WHERE 
                CAST(COALESCE(NULLIF(data->>'PESO_LIQUIDO_NPR', ''), '0') AS NUMERIC) = 0
                AND (data->>'NOME_PRODUTO_PPR') NOT LIKE 'MODELO %'
                AND (data->>'PRODUTO_PPR') NOT LIKE '%1'
            LIMIT 50
        `;
        const res = await pool.query(query);
        console.log('--- TODOS OS ITENS COM PESO ZERO NO FIREBIRD SYNC ---');
        console.table(res.rows);
        
        console.log('Total:', res.rows.length);
        
        // Check which of these are in pesos_customizados
        const checked = [];
        for (const row of res.rows) {
            const custom = await pool.query('SELECT peso FROM pesos_customizados WHERE codigo = $1', [row.prod.trim()]);
            checked.push({
                ...row,
                custom: custom.rows.length > 0 ? custom.rows[0].peso : 'NONE'
            });
        }
        console.log('--- COM PESOS CUSTOMIZADOS ---');
        console.table(checked.filter(c => c.custom === 'NONE'));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debug();
