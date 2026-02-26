
require('dotenv').config({ path: '.env.local' });
const pool = require('./lib/db');

(async () => {
    try {
        const r = await pool.query('SELECT cliente, COUNT(*) FROM refugo_apontado_sincronizado GROUP BY cliente ORDER BY 2 DESC');
        console.table(r.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
        process.exit(0);
    }
})();
