require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');

(async () => {
    try {
        console.log('Checking liga column in producao_apontada_sincronizada...');

        // Count records total
        const countRes = await pool.query('SELECT COUNT(*) FROM producao_apontada_sincronizada');
        console.log(`Total records: ${countRes.rows[0].count}`);

        // Count records with liga not null
        const ligaRes = await pool.query('SELECT COUNT(*) FROM producao_apontada_sincronizada WHERE liga IS NOT NULL');
        console.log(`Records with liga: ${ligaRes.rows[0].count}`);

        // Show first 5 with liga
        const rowsRes = await pool.query('SELECT id, produto, liga FROM producao_apontada_sincronizada WHERE liga IS NOT NULL LIMIT 5');
        if (rowsRes.rows.length > 0) {
            console.log('Sample data with liga:', rowsRes.rows);
        } else {
            console.log('No data with liga found yet.');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
})();
