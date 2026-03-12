const pool = require('./lib/db');

async function debugZeroWeights() {
    try {
        console.log('--- DEBUGGING ZERO WEIGHTS ---');
        
        // 1. Check synced records with effectively zero weight
        const query = `
            SELECT 
                t.id,
                t.data_producao,
                t.setor,
                t.produto,
                t.codigo_peca,
                t.peso_un as peso_erp,
                p.peso as peso_custom,
                COALESCE(NULLIF(t.peso_un, 0), p.peso, 0) as peso_final
            FROM producao_apontada_sincronizada t
            LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
            WHERE COALESCE(NULLIF(t.peso_un, 0), p.peso, 0) = 0
            LIMIT 20
        `;
        
        const result = await pool.query(query);
        console.log(`Found ${result.rows.length} records (Limit 20)`);
        
        result.rows.forEach(r => {
            console.log(`ID: ${r.id} | Data: ${r.data_producao.toISOString().split('T')[0]} | Peca: ${r.codigo_peca} | Final: ${r.peso_final}`);
        });

        // 2. Total Count
        const countResult = await pool.query(`
             SELECT COUNT(*) FROM producao_apontada_sincronizada t
             LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
             WHERE COALESCE(NULLIF(t.peso_un, 0), p.peso, 0) = 0
        `);
        console.log(`Total Count: ${countResult.rows[0].count}`);

    } catch (err) {
        console.error('Debug Error:', err.message);
    } finally {
        process.exit();
    }
}

debugZeroWeights();
