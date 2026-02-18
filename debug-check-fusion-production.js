require('dotenv').config({ path: '.env.local' });
const pool = require('./lib/db');

(async () => {
    try {
        const client = await pool.connect();
        const producaoAgg = await client.query(`
            SELECT 
                to_char(t.data_producao, 'YYYY-MM') as mes_ano, 
                SUM(t.quantidade * COALESCE(NULLIF(t.peso_un, 0), p.peso, 0)) as total_peso
            FROM producao_apontada_sincronizada t
            LEFT JOIN produto_pesos_producao p ON t.codigo_peca = p.codigo_peca
            WHERE t.data_producao >= '2025-01-01'
              AND t.setor = 'FUSAO'
            GROUP BY 1
            ORDER BY 1 DESC
        `);
        console.log('Fusion Production Data:', producaoAgg.rows);
        client.release();
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
