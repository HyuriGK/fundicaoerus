const pool = require('../lib/db');
require('dotenv').config({ path: '.env.local' });

async function verify() {
    try {
        const query = `
            SELECT 
                EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) as ano,
                EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) as mes,
                SUM(CAST(COALESCE(p.data->>'PESO_LIQUIDO_NPR', '0') AS NUMERIC)) as total_peso
            FROM firebird_sync_emissoes p
            WHERE EXTRACT(YEAR FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = 2026
              AND EXTRACT(MONTH FROM (p.data->>'DATA_EMISSAO_PEDIDO')::date) = 4
            GROUP BY 1, 2
        `;
        const res = await pool.query(query);
        console.log('April 2026 Emission Totals:', res.rows[0]);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
verify();
