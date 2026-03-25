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
        const res = await pool.query("SELECT id, data_producao, setor, quantidade FROM producao_apontada_sincronizada WHERE op = '3641' ORDER BY data_producao, id");
        res.rows.forEach(r => {
            console.log(`${r.id}|${r.data_producao}|${r.setor}|${r.quantidade}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
})();
