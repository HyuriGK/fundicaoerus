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

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro:', err);
        return;
    }

    // Buscar colunas da NOTA_FISCAL_PRODUTO
    db.query(`
        SELECT rf.rdb$field_name as field_name
        FROM rdb$relation_fields rf
        WHERE rf.rdb$relation_name = 'NOTA_FISCAL_PRODUTO'
        ORDER BY rf.rdb$field_position
    `, function (err, columns) {
        if (err) {
            console.error('Erro:', err);
        } else {
            console.log('COLUNAS DA NOTA_FISCAL_PRODUTO:\n');
            columns.forEach(col => {
                console.log(col.FIELD_NAME.trim());
            });
        }
        db.detach();
    });
});
