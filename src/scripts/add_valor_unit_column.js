require('dotenv').config({ path: '.env.local' });
const pool = require('../../lib/db');

async function migrate() {
    try {
        const client = await pool.connect();
        try {
            console.log('Checking if valor_unit column exists in acabamento_externo_registros...');
            const res = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='acabamento_externo_registros' AND column_name='valor_unit'
            `);

            if (res.rowCount === 0) {
                console.log('Column valor_unit not found. Adding it...');
                await client.query('ALTER TABLE acabamento_externo_registros ADD COLUMN valor_unit NUMERIC(10,2)');
                console.log('Column valor_unit added successfully.');
            } else {
                console.log('Column valor_unit already exists.');
            }

        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        // End the pool to allow the script to exit
        await pool.end();
    }
}

migrate();
