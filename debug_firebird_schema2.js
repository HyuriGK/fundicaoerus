const firebird = require('node-firebird');
const options = {
    host: 'Desktop-dqarv0d', port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA', password: 'masterkey',
    lowercase_keys: false, role: null, pageSize: 4096, wireCrypt: true
};

firebird.attach(options, function (err, db) {
    if (err) throw err;
    db.query(`
        SELECT RDB$RELATION_NAME, RDB$FIELD_NAME 
        FROM RDB$RELATION_FIELDS 
        WHERE TRIM(RDB$RELATION_NAME) = 'PAGAR'
    `, function (err, result) {
        if (err) throw err;
        const schema = { PAGAR: [] };
        result.forEach(r => {
            const t = r.RDB$RELATION_NAME.trim();
            const c = r.RDB$FIELD_NAME.trim();
            if (schema[t]) schema[t].push(c);
        });
        console.log('PAGAR FORNECEDOR JOIN LINK:', schema.PAGAR.filter(c => c.includes('FORN') || c.includes('FRN')));
        db.detach();
    });
});
