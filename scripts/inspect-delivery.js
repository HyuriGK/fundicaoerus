require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

console.log('🔍 Analisando PEDIDO_PRODUTO_ENTREGA...');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro:', err);
        return;
    }

    db.query('SELECT FIRST 1 * FROM PEDIDO_PRODUTO_ENTREGA', function (err, rows) {
        if (err) {
            console.error('Erro:', err.message);
        } else if (rows.length === 0) {
            console.log('Tabela vazia.');
        } else {
            console.log('Colunas:', Object.keys(rows[0]).join(', '));
        }
        db.detach();
    });
});
