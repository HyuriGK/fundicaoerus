require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

// Logic from lib/db.js
function cleanConnectionString(str) {
    if (!str) throw new Error('No DB URL');
    let cleaned = str.trim();
    if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim();
    return cleaned.replace(/^['"]|['"]$/g, '');
}

const connectionString = cleanConnectionString(process.env.DATABASE_URL);
console.log('Connecting to:', connectionString.substring(0, 20) + '...');

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'pesos_customizados'
        `);
        console.log('Schema for pesos_customizados:');
        console.table(res.rows);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

checkSchema();
