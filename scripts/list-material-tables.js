require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096, wireCrypt: true
};

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
