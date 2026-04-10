const { Pool } = require('pg');
const uri = "postgresql://neondb_owner:npg_qYnfKai9X4cx@ep-still-recipe-ah0lg56g-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const pool = new Pool({ connectionString: uri });

async function checkEmissions() {
    try {
        const query = `
            SELECT 
                data->>'CODIGO_ORDEM_PEDIDO_PPR' as CODIGO,
                data->>'DATA_EMISSAO_PEDIDO' as EMISSAO,
                data->>'FATURADO_PPR' as FATURADO,
                data->>'SALDO_LIBERADO_FATURAR_PPR' as SALDO_LIB,
                data->>'QUANTIDADE_PPR' as QTD_ORIG,
                data->>'QUANTIDADE_FATURADO_PPR' as QTD_FAT,
                data->>'CLIENTE_NPR' as CLIENTE
            FROM firebird_sync_pedidos 
            WHERE (data->>'DATA_EMISSAO_PEDIDO')::date = '2026-04-10'
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
