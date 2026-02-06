const path = require('path');
const dotenv = require('dotenv');

// Try loading .env.local first, then .env
const envLocalPath = path.resolve('C:\\Users\\brasi\\Desktop\\server\\.env.local');
const envPath = path.resolve('C:\\Users\\brasi\\Desktop\\server\\.env');

const resultLocal = dotenv.config({ path: envLocalPath });
if (resultLocal.error) {
    console.log('.env.local not found or error loading, trying .env');
    dotenv.config({ path: envPath });
} else {
    console.log('Loaded .env.local');
}

if (!process.env.DATABASE_URL) {
    console.error('CRITICAL: DATABASE_URL not found in environment variables.');
    // We can't proceed without it, but let's see if db.js crashes or if we can help headers
}

const pool = require('../lib/db');

async function fixSchema() {
    try {
        console.log('Checking database schema...');

        // Wait a small moment for db.js testConnection to potentially run
        await new Promise(resolve => setTimeout(resolve, 1000));

        const client = await pool.connect();
        try {
            console.log('Adding column "excluido_manualmente" if not exists...');
            await client.query(`
                ALTER TABLE faturamento_firebird 
                ADD COLUMN IF NOT EXISTS excluido_manualmente BOOLEAN DEFAULT FALSE;
            `);
            console.log('Schema update successful.');
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error fixing schema:', error);
        if (error.stack) console.error(error.stack);
    } finally {
        await pool.end();
    }
}

fixSchema();
