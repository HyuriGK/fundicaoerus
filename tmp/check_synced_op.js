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
        const res = await pool.query("SELECT data FROM firebird_sync_pedidos WHERE data->>'OP_PCS' = '3235'");
        if (res.rows.length === 0) {
            console.log('Record not found');
        } else {
            const data = res.rows[0].data;
            console.log(JSON.stringify({
                OP: data.OP_PCS,
                QTY_PPR: data.QUANTIDADE_PPR,
                QTY_USI: data.QTY_USINAGEM,
                QTY_QUAL: data.QTY_QUALIDADE,
                QTY_EXP: data.QTY_EXPEDICAO
            }, null, 2));
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
})();
