require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');

(async () => {
    try {
        console.log('Verifying OP and Code columns in Postgres...');

        // Sample records with new columns
        const sampleRes = await pool.query('SELECT op, codigo_peca, produto, data_producao FROM producao_apontada_sincronizada WHERE op IS NOT NULL OR codigo_peca IS NOT NULL LIMIT 5');

        if (sampleRes.rows.length === 0) {
            console.log('⚠️ No records found with OP or Code populated. Checking if any records exist...');
            const countRes = await pool.query('SELECT COUNT(*) FROM producao_apontada_sincronizada');
            console.log('Total Records:', countRes.rows[0].count);
        } else {
            console.log('✅ Found records with OP/Code:');
            console.table(sampleRes.rows);
        }

        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error('Error verifying:', err);
        process.exit(1);
    }
})();
