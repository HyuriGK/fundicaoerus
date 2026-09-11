const pool = require('../lib/db');

Promise.all([
    pool.query(`
        SELECT 'emissoes' AS tabela, sync_key, data
        FROM firebird_sync_emissoes
        WHERE data::text LIKE '%108.3%'
           OR data::text LIKE '%115.27%'
           OR data::text LIKE '%65.16%'
           OR data::text LIKE '%43.47%'
    `),
    pool.query(`
        SELECT 'pedidos' AS tabela, sync_key, data
        FROM firebird_sync_pedidos
        WHERE data::text LIKE '%108.3%'
           OR data::text LIKE '%115.27%'
           OR data::text LIKE '%65.16%'
           OR data::text LIKE '%43.47%'
    `)
]).then(([emissoes, pedidos]) => {
    const rows = [...emissoes.rows, ...pedidos.rows];
    console.log(JSON.stringify(rows.map(row => ({
        tabela: row.tabela,
        sync_key: row.sync_key,
        pesos: Object.fromEntries(Object.entries(row.data).filter(([key]) => /peso/i.test(key)))
    })), null, 2));
}).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(() => pool.end());
