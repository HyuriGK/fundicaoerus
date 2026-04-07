require('dotenv').config({ path: '.env.local' });


const { Firebird, options: FIREBIRD_OPTIONS } = require('../lib/firebird-helper');

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
