const pool = require('../lib/db');

async function verify() {
    try {
        const query = `
            SELECT p.data 
            FROM firebird_sync_emissoes p 
            INNER JOIN (
                SELECT DISTINCT pedido, codigo FROM carteira
            ) c ON (p.data->>'CODIGO_PPR') = c.pedido AND (p.data->>'PRODUTO_PPR') = c.codigo 
            LIMIT 5
        `;
        const res = await pool.query(query);
        console.log('Items found in Carteira join:', res.rows.length);
        res.rows.forEach((row, i) => {
            const d = row.data;
            console.log(`[${i}] Pedido: ${d.CODIGO_PPR}, Peca: ${d.PRODUTO_PPR}, OP: ${d.OP_PCS}, QTY_MOLDADA: ${d.QTY_MOLDADA}`);
        });

        if (res.rows.length === 0) {
            console.log('WARNING: No items found in the join between firebird_sync_emissoes and carteira.');
            console.log('Check sample data from firebird_sync_emissoes:');
            const sample = await pool.query('SELECT data->>\'CODIGO_PPR\' as ped, data->>\'PRODUTO_PPR\' as prod FROM firebird_sync_emissoes LIMIT 5');
            console.table(sample.rows);
            console.log('Check sample data from carteira:');
            const sampleC = await pool.query('SELECT pedido, codigo FROM carteira LIMIT 5');
            console.table(sampleC.rows);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

verify();
