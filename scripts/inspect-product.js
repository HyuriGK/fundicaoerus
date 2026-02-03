require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

console.log('🔍 Analisando PEDIDO_PRODUTO...');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro con:', err);
        return;
    }

    // Ler 1 linha de PEDIDO_PRODUTO
    db.query('SELECT FIRST 1 * FROM PEDIDO_PRODUTO', function (err, rows) {
        if (err) {
            console.error('Erro:', err.message);
        } else if (rows.length === 0) {
            console.log('Tabela vazia.');
        } else {
            const cols = Object.keys(rows[0]);
            console.log('Colunas:', cols.join(', '));

            // Procurar candidatos a chave primária
            const keys = cols.filter(c =>
                c.includes('EMPRESA') ||
                c.includes('CODIGO') ||
                c.includes('ANO') ||
                c.includes('SEQ') ||
                c.includes('ITEM')
            );
            console.log('\nProváveis chaves:', keys.join(', '));
        }
        db.detach();
    });
});
