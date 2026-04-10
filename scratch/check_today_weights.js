const { Pool } = require('pg');
const uri = "postgresql://neondb_owner:npg_qYnfKai9X4cx@ep-still-recipe-ah0lg56g-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const pool = new Pool({ connectionString: uri });

async function checkWeights() {
    try {
        const query = `
            SELECT data->>'QUANTIDADE_PPR' as q, data->>'PESO_LIQUIDO_NPR' as w 
            FROM firebird_sync_pedidos 
            WHERE (data->>'DATA_EMISSAO_PEDIDO') LIKE '2026-04-10%'
        `;
        const res = await pool.query(query);
        res.rows.forEach(r => {
            console.log(`Q: ${r.q} | W: ${r.w}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkWeights();
