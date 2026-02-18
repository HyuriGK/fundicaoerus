require('dotenv').config({ path: '.env.local' });
const pool = require('./lib/db');

(async () => {
    try {
        const res = await pool.query('SELECT motivo, pg_typeof(motivo) FROM refugo_apontado_sincronizado LIMIT 5');
        console.log('Motivo Values:', res.rows);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
