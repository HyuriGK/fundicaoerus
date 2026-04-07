require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const FIREBIRD_OPTIONS = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096, wireCrypt: true
};

Firebird.attach(FIREBIRD_OPTIONS, function (err, db) {
    if (err) {
        console.error('Error connecting:', err);
        return;
    }

    const query = 'SELECT FIRST 1 * FROM PEDIDO_PRODUTO_CALCULO_PRECO';
    db.query(query, function (err, result) {
        if (err) {
            console.error('Error querying:', err);
        } else {
            console.log('Columns:', result.length > 0 ? Object.keys(result[0]) : 'Table empty');
            if (result.length > 0) console.log('Sample Row:', result[0]);
        }
        db.detach();
    });
});
