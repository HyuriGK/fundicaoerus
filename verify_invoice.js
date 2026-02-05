require('dotenv').config({ path: '.env.local' });
const pool = require('./lib/db');

async function verifyInvoice() {
    try {
        const res = await pool.query(`
            SELECT nota_fiscal, item_nota, codigo_item, quantidade, valor_unitario 
            FROM faturamento_firebird 
            WHERE nota_fiscal = 34744
            ORDER BY item_nota
        `);
        console.table(res.rows);
    } catch (e) {
        console.error(e.message);
    } finally {
        process.exit(0);
    }
}

verifyInvoice();
