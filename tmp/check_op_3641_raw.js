require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

function cleanConnectionString(str) {
    if (!str) return '';
    let cleaned = str.trim();
    if (cleaned.startsWith('psql')) cleaned = cleaned.substring(4).trim();
    return cleaned.replace(/^['"]|['"]$/g, '');
}

const pool = new Pool({
    connectionString: cleanConnectionString(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        console.log("--- RAW RECORDS FOR OP 3641 ---");
        const res = await pool.query("SELECT id, data_producao, setor, quantidade FROM producao_apontada_sincronizada WHERE op = '3641' ORDER BY data_producao, id");
        console.log(JSON.stringify(res.rows, null, 2));
        
        console.log("\n--- SUM BY SETOR ---");
        const resSum = await pool.query("SELECT setor, SUM(quantidade) as total FROM producao_apontada_sincronizada WHERE op = '3641' GROUP BY setor");
        console.log(JSON.stringify(resSum.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
})();
