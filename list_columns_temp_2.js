
require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const fbOptions = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096, wireCrypt: true
};

Firebird.attach(fbOptions, function (err, db) {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    // Check PEDIDO columns
    db.query('SELECT FIRST 1 * FROM PEDIDO', (err, rows) => {
        if (err) console.error(err);
        else if (rows.length > 0) {
            console.log('PEDIDO Columns:', Object.keys(rows[0]).join(', '));
        } else {
            console.log('PEDIDO table is empty or does not exist.');
        }

        // Let's also check if there's a table called VENDAS
        db.query('SELECT FIRST 1 * FROM VENDAS', (err, rows) => {
            if (err) console.log('VENDAS table does not exist.');
            else if (rows.length > 0) {
                console.log('VENDAS Columns:', Object.keys(rows[0]).join(', '));
            }
            db.detach();
        });
    });
});
