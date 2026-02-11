require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        console.log('Testing connection...');
        const res = await pool.query('SELECT 1');
        console.log('Connection successful:', res.rows[0]);
        await pool.end();
        process.exit(0);
    } catch (err) {
        console.error('Connection failed:', err);
        process.exit(1);
    }
})();
