require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');

async function test() {
    try {
        const client = await pool.connect();
        console.log('✅ Connection successful!');
        const res = await client.query('SELECT NOW()');
        console.log('Timestamp:', res.rows[0]);
        client.release();
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection failed:', err);
        process.exit(1);
    }
}

test();
