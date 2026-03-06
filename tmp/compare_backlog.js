const pool = require('../lib/db');

async function checkBacklog() {
    try {
        console.log('--- BACKLOG COMPARISON ---');

        // 1. OPs from Sync that are NOT fully billed
        const nonBilled = await pool.query(`
            SELECT data->>'OP_PCS' as op, data->>'FATURADO_PPR' as fat, data->>'CODIGO_PPR' as pedido 
            FROM firebird_sync_pedidos 
            WHERE (data->>'FATURADO_PPR' = 'N' OR data->>'FATURADO_PPR' = 'P')
            AND (data->>'OP_PCS') IS NOT NULL
        `);
        console.log('Total Sync Backlog (N/P):', nonBilled.rows.length);

        // 2. OPs from Sync that are in Carteira Table
        const inCarteira = await pool.query(`
            SELECT p.data->>'OP_PCS' as op, p.data->>'CODIGO_PPR' as pedido
            FROM firebird_sync_pedidos p
            INNER JOIN (SELECT DISTINCT pedido FROM carteira) c ON (p.data->>'CODIGO_PPR') = c.pedido
            WHERE (p.data->>'OP_PCS') IS NOT NULL
        `);
        console.log('Total Joined by Carteira:', inCarteira.rows.length);

        // 3. Find examples of OPs in Backlog but NOT in Carteira
        const carteiraSet = new Set((await pool.query("SELECT DISTINCT pedido FROM carteira")).rows.map(r => r.pedido));
        const missing = nonBilled.rows.filter(r => !carteiraSet.has(r.pedido));

        console.log('\n--- EXAMPLES IN BACKLOG BUT NOT IN CARTEIRA ---');
        console.table(missing.slice(0, 5));

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkBacklog();
