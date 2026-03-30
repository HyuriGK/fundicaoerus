const path = require('path');
const pool = require('c:/Users/brasi/Desktop/server/lib/db');
async function check() {
    try {
        const query = `
            SELECT nota_fiscal, cliente_nome, pedido 
            FROM faturamento_firebird 
            WHERE TRIM(cliente_nome) LIKE 'IMEPEL%' 
               OR TRIM(cliente_nome) LIKE 'STEELROOL%' 
               OR TRIM(cliente_nome) LIKE 'SPILROD%' 
            LIMIT 10
        `;
        const r = await pool.query(query);
        console.log(JSON.stringify(r.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();
