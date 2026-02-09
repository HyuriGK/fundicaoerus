const fs = require('fs');
const path = require('path');
const pool = require('../lib/db');

async function run() {
    const sqlPath = path.join(__dirname, 'add-valor_unit-column.sql');
    if (!fs.existsSync(sqlPath)) {
        console.error('Arquivo SQL não encontrado:', sqlPath);
        process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    let client;
    try {
        client = await pool.connect();
        console.log('Executando migração:', sqlPath);
        await client.query(sql);
        console.log('Migração executada com sucesso.');
        process.exit(0);
    } catch (err) {
        console.error('Erro ao executar migração:', err);
        process.exit(2);
    } finally {
        if (client) client.release();
    }
}

run();
