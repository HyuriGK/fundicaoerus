const pool = require('../lib/db');
(async () => {
    try {
        const r = await pool.query(`
            SELECT data->>'PRODUTO_PPR' as cod, data->>'ROTEIRO_PRODUCAO' as roteiro 
            FROM firebird_sync_emissoes 
            WHERE data->>'ROTEIRO_PRODUCAO' IS NOT NULL 
              AND TRIM(data->>'ROTEIRO_PRODUCAO') != ''
            LIMIT 10
        `);
        console.log(r.rows);
    } catch(err) {
        console.error(err);
    } finally {
        await pool.end();
    }
})();
