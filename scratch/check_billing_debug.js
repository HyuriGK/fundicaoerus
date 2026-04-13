const pool = require('../lib/db');

async function debug() {
    try {
        const query = `
            SELECT 
                DATE_TRUNC('month', data) as mes, 
                SUM(peso_total) as peso_total,
                SUM(valor_total) as valor_total
            FROM faturamento_diario 
            WHERE data >= '2026-01-01'
            GROUP BY 1
            ORDER BY 1
        `;
        const res = await pool.query(query);
        console.log(JSON.stringify(res.rows, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

debug();
