const { Pool } = require('pg');
const uri = "postgresql://neondb_owner:npg_qYnfKai9X4cx@ep-still-recipe-ah0lg56g-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const pool = new Pool({ connectionString: uri });

async function checkEmissions() {
    try {
        const query = `
            SELECT 
                "CODIGO_ORDEM_PEDIDO_PPR", 
                "DATA_EMISSAO_PEDIDO", 
                "FATURADO_PPR", 
                "SALDO_LIBERADO_FATURAR_PPR", 
                "QUANTIDADE_PPR", 
                "QUANTIDADE_FATURADO_PPR",
                "CLIENTE_NPR"
            FROM firebird_sync_pedidos 
            WHERE ("DATA_EMISSAO_PEDIDO"::date = '2026-04-10')
        `;
        const res = await pool.query(query);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkEmissions();
