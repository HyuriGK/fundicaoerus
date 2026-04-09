const { Pool } = require('pg');

async function check() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        const res = await pool.query("SELECT data FROM firebird_sync_pedidos LIMIT 10");
        console.log("Sample keys:", res.rows.map(r => Object.keys(r.data)));
        
        const res2 = await pool.query("SELECT count(*) FROM firebird_sync_pedidos WHERE (data->>'FATURADO_PPR') = 'T'");
        console.log("Total with FATURADO_PPR = 'T':", res2.rows[0].count);
        
        const res3 = await pool.query("SELECT count(*) FROM firebird_sync_pedidos WHERE ((data->>'QUANTIDADE_PPR')::numeric - COALESCE((data->>'QUANTIDADE_FATURADA_PPR')::numeric, 0)) > 0");
        console.log("Total with positive balance:", res3.rows[0].count);
        
        const res4 = await pool.query("SELECT count(*) FROM firebird_sync_pedidos WHERE (data->>'FATURADO_PPR') = 'T' AND ((data->>'QUANTIDADE_PPR')::numeric - COALESCE((data->>'QUANTIDADE_FATURADA_PPR')::numeric, 0)) > 0");
        console.log("Total 'T' with positive balance:", res4.rows[0].count);

    } catch (e) {
        console.error(e.message);
    } finally {
        await pool.end();
    }
}

check();
