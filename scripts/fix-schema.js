const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

function cleanConnectionString(connectionString) {
    if (!connectionString) throw new Error('DATABASE_URL missing');
    let cleaned = connectionString.trim();
    if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim();
    cleaned = cleaned.replace(/^['"]|['"]$/g, '');
    return cleaned;
}

async function fixSchema() {
    const rawConnectionString = process.env.DATABASE_URL || '';
    const connectionString = cleanConnectionString(rawConnectionString);
    const pool = new Pool({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('--- Checking schema ---');
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'custos_registros' AND column_name = 'produto'");
        if (res.rows.length === 0) {
            console.log('Adding column "produto"...');
            await pool.query("ALTER TABLE custos_registros ADD COLUMN produto VARCHAR(255)");
            console.log('Column added.');
        } else {
            console.log('Column "produto" already exists.');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixSchema();
