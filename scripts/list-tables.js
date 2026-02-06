
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

// Fix database URL
let url = process.env.DATABASE_URL;
if (url.startsWith("psql '")) {
    url = url.substring(6, url.length - 1);
}

const pool = new Pool({ connectionString: url });

async function run() {
    try {
        const res = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name LIKE '%faturamento%'
        `);
        console.log("📂 Tables found:", res.rows.map(r => r.table_name));
    } catch (e) {
        console.error("❌ Error:", e);
    } finally {
        await pool.end();
    }
}

run();
