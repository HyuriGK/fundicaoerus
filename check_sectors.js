
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env.local') });
const pool = require('./lib/db');

async function checkSectors() {
    try {
        const res = await pool.query('SELECT DISTINCT setor FROM producao_apontada_sincronizada');
        console.log("Sectors:", res.rows.map(r => r.setor));
    } catch (e) {
        console.error(e);
    }
}

checkSectors();
