require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL.replace(/^['"]|['"]$/g, ''), ssl: { rejectUnauthorized: false } });

pool.query('SELECT count(*) FROM ficha_tecnica WHERE relacao_molde_metal IS NOT NULL AND relacao_molde_metal > 0')
    .then(res => {
        console.log('Items with Relationship > 0:', res.rows[0].count);
        process.exit(0);
    })
    .catch(e => {
        console.error(e);
        process.exit(1);
    });
