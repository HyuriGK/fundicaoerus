require('dotenv').config({ path: '.env.local' });


const { Firebird, options: options } = require('../lib/firebird-helper');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    db.query("SELECT rdb$relation_name FROM rdb$relations WHERE rdb$relation_name LIKE '%MATERIAL%'", function (err, result) {
        if (result) {
            console.log('\n==== TABELAS COM "MATERIAL" ====');
            result.forEach(row => console.log(row.RDB$RELATION_NAME.trim()));
        }
        db.detach();
    });
});
