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
    if (err) throw err;

    const produtoId = 184008800; // From previous sample

    console.log('--- Columns of PRODUTO ---');
    db.query(`
        SELECT RDB$FIELD_NAME 
        FROM RDB$RELATION_FIELDS 
        WHERE RDB$RELATION_NAME = 'PRODUTO'
    `, function (err, result) {
        if (err) console.error(err);
        else console.log(result.map(r => r.RDB$FIELD_NAME.trim()).join(', '));

        console.log(`\n--- Fetching PRODUTO where CODIGO_PRO = ${produtoId} ---`);
        db.query(`
            SELECT * 
            FROM PRODUTO 
            WHERE CODIGO_PRO = ?
        `, [produtoId], function (err, rows) {
            if (err) console.error(err);
            else {
                if (rows.length > 0) {
                    console.log('MATCH FOUND!');
                    console.log(JSON.stringify(rows[0], null, 2));
                } else {
                    // Try ID_PRO if CODIGO_PRO doesn't work
                    console.log('NO MATCH for CODIGO_PRO. Trying ID_PRO...');
                    db.query(`SELECT * FROM PRODUTO WHERE ID_PRO = ?`, [produtoId], function (e2, r2) {
                        if (r2 && r2.length > 0) {
                            console.log('MATCH FOUND via ID_PRO!');
                            console.log(JSON.stringify(r2[0], null, 2));
                        } else {
                            console.log('NO MATCH FOUND.');
                        }
                        db.detach();
                    });
                    return;
                }
                db.detach();
            }
        });
    });
});
