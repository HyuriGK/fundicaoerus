const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL || 'postgres://default:A6qC1hYwPWSx@ep-aged-grass-a4sh38wa.us-east-1.aws.neon.tech:5432/verceldb?sslmode=require'
});

async function diagnose() {
    try {
        console.log('--- Diagnosing Zero Weight Tasks ---');

        const queryCountSync = 'SELECT count(*) FROM firebird_sync_pedidos';
        const resSync = await pool.query(queryCountSync);
        console.log(`Total items in firebird_sync_pedidos: ${resSync.rows[0].count}`);

        const queryCountCarteira = 'SELECT count(*) FROM carteira';
        const resCarteira = await pool.query(queryCountCarteira);
        console.log(`Total items in carteira: ${resCarteira.rows[0].count}`);

        const queryZero = `
            WITH items_backlog AS (
                SELECT DISTINCT pedido, codigo FROM carteira
            )
            SELECT 
                p.data->>'CODIGO_PPR' as pedido,
                p.data->>'PRODUTO_PPR' as codigo,
                p.data->>'PESO_LIQUIDO_NPR' as peso_liquido,
                pc.peso as peso_custom,
                weight_ref.peso as peso_ref
            FROM firebird_sync_pedidos p
            INNER JOIN items_backlog ib ON TRIM(p.data->>'CODIGO_PPR') = ib.pedido AND TRIM(p.data->>'PRODUTO_PPR') = ib.codigo
            LEFT JOIN pesos_customizados pc ON TRIM(p.data->>'PRODUTO_PPR') = pc.codigo
            LEFT JOIN produto_pesos_producao weight_ref ON TRIM(p.data->>'PRODUTO_PPR') = weight_ref.codigo_peca
            WHERE 
                COALESCE(
                    pc.peso,
                    NULLIF(CAST(COALESCE(p.data->>'PESO_LIQUIDO_NPR', '0') AS NUMERIC), 0),
                    weight_ref.peso,
                    0
                ) = 0
                AND NOT (TRIM(p.data->>'PRODUTO_PPR') LIKE '%1' AND TRIM(p.data->>'NOME_PRODUTO_PPR') LIKE 'MODELO %')
            LIMIT 10
        `;
        const resZero = await pool.query(queryZero);
        console.log(`Zero weight items found: ${resZero.rowCount}`);
        if (resZero.rowCount > 0) {
            console.table(resZero.rows);
        }

        // Test without inner join to see if the join is the problem
        const queryZeroNoJoin = `
            SELECT 
                p.data->>'CODIGO_PPR' as pedido,
                p.data->>'PRODUTO_PPR' as codigo
            FROM firebird_sync_pedidos p
            WHERE 
                COALESCE(
                    NULLIF(CAST(COALESCE(p.data->>'PESO_LIQUIDO_NPR', '0') AS NUMERIC), 0),
                    0
                ) = 0
            LIMIT 5
        `;
        const resNoJoin = await pool.query(queryZeroNoJoin);
        console.log(`Zero weight items (simple query): ${resNoJoin.rowCount}`);

    } catch (err) {
        console.error('Error during diagnosis:', err);
    } finally {
        await pool.end();
    }
}

diagnose();
