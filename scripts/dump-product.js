require('dotenv').config({ path: '.env.local' });


const { Firebird, options: options } = require('../lib/firebird-helper');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    const prodCode = '252023600';
    db.query("SELECT * FROM PRODUTO WHERE CODIGO_PRO = ?", [prodCode], (err, rows) => {
        if (rows && rows.length > 0) {
            console.log(JSON.stringify(rows[0], null, 2));
        } else {
            console.log('Produto não encontrado');
        }
        db.detach();
    });
});
