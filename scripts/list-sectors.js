require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');

(async () => {
    try {
        const res = await pool.query('SELECT DISTINCT setor FROM producao_apontada_sincronizada ORDER BY setor');
        console.table(res.rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
