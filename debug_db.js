require('dotenv').config({ path: '.env.local' });
const pool = require('./lib/db');

async function debug() {
    try {
        const schema = await pool.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'faturamento_firebird'
            ORDER BY ordinal_position
        `);
        console.log('--- SCHEMA ---');
        console.table(schema.rows);

        const data = await pool.query(`
            SELECT nota_fiscal, serie, codigo_item, descricao, peso_un, peso_total 
            FROM faturamento_firebird 
            LIMIT 5
        `);
        console.log('--- DATA ---');
        console.table(data.rows);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debug();
