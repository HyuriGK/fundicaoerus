require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const pool = require('../lib/db');

async function checkData() {
    try {
        console.log('--- Resumo das Categorias ---');
        const { rows } = await pool.query(`
            SELECT categoria, COUNT(*) as count, SUM(valor) as total, COUNT(produto) as c_prod 
            FROM custos_registros 
            GROUP BY categoria
        `);
        console.table(rows);

        console.log('\n--- Exemplo de Documentos com Produto ---');
        const res = await pool.query(`
            SELECT data_emissao, documento, produto, valor 
            FROM custos_registros 
            WHERE produto IS NOT NULL 
            LIMIT 10
        `);
        console.table(res.rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
