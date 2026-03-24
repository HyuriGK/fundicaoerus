const { Pool } = require('pg');
const cleanUrl = process.env.DATABASE_URL.replace(/^psql\s+'(.*)'$/, '$1');
const pool = new Pool({ connectionString: cleanUrl });

async function check() {
    try {
        const res = await pool.query("SELECT * FROM producao_fichas WHERE op_codigo = '4124'");
        console.log('4124 in producao_fichas:', res.rows);
        
        const res2 = await pool.query("SELECT * FROM ficha_tecnica WHERE pro_codigo_fic = '224900100'");
        console.log('224900100 in ficha_tecnica:', res2.rows);
        
        if (res.rows.length > 0) {
            const res3 = await pool.query("SELECT * FROM roteiros_tecnicos WHERE ficha_id = $1", [res.rows[0].ficha_id]);
            console.log('Route for 4124 (via ficha_id):', res3.rows.map(r => r.setor_nome));
        }
        
        if (res2.rows.length > 0) {
            const res4 = await pool.query("SELECT * FROM roteiros_tecnicos WHERE ficha_id = $1", [res2.rows[0].codigo_fic]);
            console.log('Route for 224900100 (via ficha_id):', res4.rows.map(r => r.setor_nome));
        }

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
check();
