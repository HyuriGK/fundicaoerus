const pool = require('../lib/db');
(async () => {
    try {
        const res = await pool.query("SELECT * FROM producao_apontada_sincronizada WHERE op = '3945'");
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error('Erro:', err);
    }
    process.exit(0);
})();
