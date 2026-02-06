const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

let connectionString = process.env.DATABASE_URL;
if (connectionString && connectionString.includes("'")) {
    connectionString = connectionString.split("'")[1];
}

const pool = new Pool({ connectionString });

(async () => {
    try {
        const res = await pool.query('SELECT valor_unitario, quantidade, valor_total, peso_total FROM faturamento_firebird LIMIT 10');
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
})();
