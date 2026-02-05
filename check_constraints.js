require('dotenv').config({ path: '.env.local' });
const pool = require('./lib/db');

async function checkConstraints() {
    try {
        const res = await pool.query(`
            SELECT conname 
            FROM pg_constraint 
            WHERE conrelid = 'faturamento_firebird'::regclass
        `);
        console.table(res.rows);
    } catch (e) {
        console.error(e.message);
    } finally {
        process.exit(0);
    }
}

checkConstraints();
