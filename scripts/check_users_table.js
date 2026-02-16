const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
const pool = require('../lib/db');

async function check() {
    try {
        console.log('🔌 Conectando...');
        const client = await pool.connect();

        const resDb = await client.query('SELECT current_database(), inet_server_addr()');
        console.log('📦 Database:', resDb.rows[0].current_database);
        console.log('🖥️ IP:', resDb.rows[0].inet_server_addr);

        console.log('🔍 Verificando user schema...');
        const res = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users';
        `);

        console.log('📋 Colunas encontradas na tabela users:');
        console.table(res.rows);

        client.release();
    } catch (err) {
        console.error('❌ Erro:', err);
    } finally {
        await pool.end();
    }
}

check();
