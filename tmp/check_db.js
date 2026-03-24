const { Pool } = require('pg');
const cleanUrl = process.env.DATABASE_URL.replace(/^psql\s+'(.*)'$/, '$1');
const pool = new Pool({ connectionString: cleanUrl });

async function check() {
    try {
        const res = await pool.query("SELECT * FROM firebird_sync_pedidos WHERE (data->>'OP_PCS') = '3573'");
        console.log('3573 in sync_peditos:', res.rows.map(r => r.data));
        const opData = res.rows[0]?.data || {};
        const produto = opData.PRODUTO_PPR;
        
        console.log('Product for 3573:', produto);
        
        const resRoute = await pool.query("SELECT pf.op_codigo, rt.setor_nome FROM producao_fichas pf JOIN roteiros_tecnicos rt ON rt.ficha_id = pf.ficha_id WHERE pf.op_codigo = '3573'");
        console.log('Route for 3573 (OP-specific):', resRoute.rows.map(r => r.setor_nome));

        const resRoute2 = await pool.query("SELECT ft.pro_codigo_fic, rt.setor_nome FROM ficha_tecnica ft JOIN roteiros_tecnicos rt ON rt.ficha_id = ft.codigo_fic WHERE ft.pro_codigo_fic = $1", [produto]);
        console.log('Route for product (Fallback):', resRoute2.rows.map(r => r.setor_nome));

        const resPoints = await pool.query("SELECT setor, quantidade FROM producao_apontada_sincronizada WHERE op = '3573'");
        console.log('Points for 3573:', resPoints.rows);


    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
