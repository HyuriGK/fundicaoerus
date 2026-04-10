const { Pool } = require('pg');
const uri = "postgresql://neondb_owner:npg_qYnfKai9X4cx@ep-still-recipe-ah0lg56g-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const pool = new Pool({ connectionString: uri });

async function checkWeightsDetailed() {
    try {
        const query = `
            SELECT data
            FROM firebird_sync_pedidos 
            WHERE (data->>'DATA_EMISSAO_PEDIDO') LIKE '2026-04-10%' 
               OR (data->>'OP_EMISSAO') LIKE '2026-04-10%'
        `;
        const res = await pool.query(query);
        console.log(`Verificando ${res.rows.length} registros...`);
        res.rows.forEach(r => {
            const d = r.data;
            console.log(`Key: ${d.OP_PCS} | Q_PPR: ${d.QUANTIDADE_PPR} | OP_Q: ${d.OP_QUANTIDADE} | PesoLiq: ${d.PESO_LIQUIDO_NPR} | Emissao: ${d.DATA_EMISSAO_PEDIDO || d.OP_EMISSAO}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkWeightsDetailed();
