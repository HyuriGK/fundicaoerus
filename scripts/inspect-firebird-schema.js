require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096, wireCrypt: true
};

Firebird.attach(options, function (err, db) {
    if (err) throw err;

    // 1. Check PRODUCAO_SETOR columns again to be sure about CODIGO_PCS
    console.log('--- Columns of PRODUCAO_SETOR ---');
    db.query(`
        SELECT RDB$FIELD_NAME 
        FROM RDB$RELATION_FIELDS 
        WHERE RDB$RELATION_NAME = 'PRODUCAO_SETOR'
    `, function (err, result) {
        if (err) console.error(err);
        else console.log(result.map(r => r.RDB$FIELD_NAME.trim()).join(', '));

        // 2. Search for tables that might be the "Master" OP table (linking OP to Product)
        // We look for tables with 'PRODUCAO' in the name
        console.log('\n--- Tables with "PRODUCAO" in name ---');
        db.query(`
            SELECT RDB$RELATION_NAME 
            FROM RDB$RELATIONS 
            WHERE RDB$RELATION_NAME LIKE '%PRODUCAO%'
        `, function (err, tables) {
            if (err) console.error(err);
            else {
                console.log(tables.map(t => t.RDB$RELATION_NAME.trim()).join(', '));

                // If 'PRODUCAO' exists, let's inspect it
                if (tables.find(t => t.RDB$RELATION_NAME.trim() === 'PRODUCAO')) {
                    console.log('\n--- Columns of PRODUCAO ---');
                    db.query(`
                        SELECT RDB$FIELD_NAME 
                        FROM RDB$RELATION_FIELDS 
                        WHERE RDB$RELATION_NAME = 'PRODUCAO'
                    `, function (err, cols) {
                        if (err) console.error(err);
                        else console.log(cols.map(c => c.RDB$FIELD_NAME.trim()).join(', '));
                        db.detach();
                    });
                } else {
                    db.detach();
                }
            }
        });
    });
});
