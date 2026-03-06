const pool = require('../lib/db');

async function checkData() {
    try {
        console.log('--- RAW VALUES ---');
        const res = await pool.query(`
            SELECT 
                p.data->>'CODIGO_PPR' as sync_val,
                c.pedido as carteira_val
            FROM firebird_sync_pedidos p, carteira c
            LIMIT 10
        `);
        res.rows.forEach(r => {
            console.log(`Sync: [${r.sync_val}] | Carteira: [${r.carteira_val}]`);
        });

        console.log('\n--- CLEAN JOIN TEST ---');
        const joinRes = await pool.query(`
            SELECT COUNT(*) 
            FROM firebird_sync_pedidos p
            INNER JOIN carteira c ON 
                REGEXP_REPLACE(UPPER(p.data->>'CODIGO_PPR'), '[^A-Z0-9]', '', 'g') = 
                REGEXP_REPLACE(UPPER(c.pedido), '[^A-Z0-9]', '', 'g')
        `);
        console.log('Total Joined Rows (Cleaned):', joinRes.rows[0].count);

        const currentJoinRes = await pool.query(`
            SELECT COUNT(*) 
            FROM firebird_sync_pedidos p
            INNER JOIN carteira c ON (p.data->>'CODIGO_PPR') = c.pedido
        `);
        console.log('Total Joined Rows (Current Strict):', currentJoinRes.rows[0].count);

    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}

checkData();
