const pool = require('../lib/db');
(async () => {
    try {
        const r = await pool.query(`SELECT data FROM firebird_sync_emissoes LIMIT 1`);
        if (r.rows.length > 0) {
            const keys = Object.keys(r.rows[0].data);
            console.log("CHAVES DISPONÍVEIS:", keys.sort((a,b) => a.localeCompare(b)));
            
            // Ver se tem algo relacionado a roteiro
            const roteiroKeys = keys.filter(k => k.toLowerCase().includes('rota') || k.toLowerCase().includes('roteiro') || k.toLowerCase().includes('usinagem'));
            console.log("Chaves relacionadas a roteiro/usinagem:", roteiroKeys);
        }
    } catch(err) {
        console.error(err);
    } finally {
        await pool.end();
    }
})();
