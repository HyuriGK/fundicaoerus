const pool = require('../lib/db');

async function test() {
    try {
        // Load exclusions
        const prefRes = await pool.query("SELECT value FROM app_preferences WHERE key = 'excluded_clients'");
        const excludedClients = prefRes.rows[0]?.value.map(c => c.trim().toUpperCase()) || [];

        // Calculate March (2026-03)
        // Note: faturamento_firebird stores cliente_nome. 
        // We use TRIM to be safe.
        const query = `
            SELECT SUM(peso_total) as total
            FROM faturamento_firebird
            WHERE data_faturamento >= '2026-03-01' 
              AND data_faturamento < '2026-04-01'
              AND (excluido_manualmente = FALSE OR excluido_manualmente IS NULL)
              AND (pedido IS NOT NULL AND TRIM(pedido) != '')
              AND NOT (UPPER(TRIM(cliente_nome)) = ANY($1))
        `;
        
        const res = await pool.query(query, [excludedClients]);
        console.log('Total Calculado para Março (com filtros + pedido):', res.rows[0].total, 'kg');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

test();
