
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const pool = require('../lib/db');

async function checkData() {
    try {
        console.log('Connecting to DB...');
        const res = await pool.query(`
            SELECT data 
            FROM firebird_sync_pedidos 
            LIMIT 5
        `);

        console.log('Checking first 5 records for Weight analysis...');
        res.rows.forEach((r, i) => {
            const q = r.data.QUANTIDADE_PPR;
            const w = r.data.PESO_LIQUIDO_NPR;
            const unit = q ? (w / q).toFixed(3) : 0;
            console.log(`[${i}] QTD: ${q} | WEIGHT: ${w} | CALC UNIT: ${unit} | PROD: ${r.data.PRODUTO_PPR}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        pool.end();
    }
}

checkData();
