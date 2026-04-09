const pool = require('../lib/db');

async function checkDuplicates() {
    try {
        const query = `
            SELECT 
                p.sync_key, 
                count(*) as occurrences
            FROM firebird_sync_pedidos p
            LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
            GROUP BY p.sync_key
            HAVING count(*) > 1
            LIMIT 20
        `;
        
        console.log('🔍 Verificando itens duplicados por causa do JOIN com ficha_tecnica...');
        const res = await pool.query(query);
        
        if (res.rows.length === 0) {
            console.log('✅ Nenhuma duplicata encontrada pelo JOIN.');
        } else {
            console.log(`⚠️ Encontradas ${res.rows.length} chaves duplicadas!`);
            res.rows.forEach(row => {
                console.log(`Sync Key: ${row.sync_key} | Ocorrências: ${row.occurrences}`);
            });
        }
        
        // Also check if OP 3641 item is duplicated
        const opCheck = `
            SELECT 
                p.sync_key, 
                p.data->>'PRODUTO_PPR' as produto
            FROM firebird_sync_pedidos p
            LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
            WHERE p.data->>'OP_PCS' = '3641'
        `;
        const resOp = await pool.query(opCheck);
        console.log(`\n🔎 Verificando OP 3641: Encontradas ${resOp.rows.length} linhas para este item.`);
        
    } catch (err) {
        console.error('Erro:', err);
    } finally {
        await pool.end();
    }
}

checkDuplicates();
