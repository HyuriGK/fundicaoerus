require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');

(async () => {
    try {
        console.log('Verifying synced data in Postgres...');

        // Count records
        const countRes = await pool.query('SELECT COUNT(*) FROM producao_apontada_sincronizada');
        console.log('Total Records:', countRes.rows[0].count);

        // Sample records
        const sampleRes = await pool.query('SELECT * FROM producao_apontada_sincronizada ORDER BY data_producao DESC LIMIT 5');
        console.log('Sample Data (Latest 5):');
        console.table(sampleRes.rows);

        // Check for null sectors or products
        const nullRes = await pool.query(`
            SELECT COUNT(*) 
            FROM producao_apontada_sincronizada 
            WHERE setor = 'DESCONHECIDO' OR produto = 'PRODUTO DESCONHECIDO'
        `);
        console.log('Records with Unknown Sector/Product:', nullRes.rows[0].count);

        await pool.end();
    } catch (err) {
        console.error('Error verifying:', err);
    }
})();
