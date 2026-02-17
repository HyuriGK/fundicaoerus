require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

function cleanConnectionString(str) {
    if (!str) return '';
    let cleaned = str.trim();
    if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim();
    return cleaned.replace(/^['"]|['"]$/g, '');
}

const pool = new Pool({
    connectionString: cleanConnectionString(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false }
});

async function inspect() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type, column_default, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'users';
        `);
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

inspect();
