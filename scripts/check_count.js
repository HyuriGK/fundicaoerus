require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const url = process.env.DATABASE_URL.replace(/^['"]/, '').replace(/['"]$/, '');
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
pool.query('SELECT count(*) FROM ficha_tecnica')
    .then(res => {
        console.log('Count:', res.rows[0].count);
        process.exit(0);
    })
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
