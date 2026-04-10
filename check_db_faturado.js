const pool = require('./lib/db');
async function test() {
    try {
        const query = `
            SELECT 
                p.data->>'FATURADO_PPR' as fat, 
                COUNT(*) as c 
            FROM firebird_sync_emissoes p 
            WHERE p.data->>'DATA_EMISSAO_PEDIDO' LIKE '2026-04-02%' 
            GROUP BY 1
        `;
        const res = await pool.query(query);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
test();
