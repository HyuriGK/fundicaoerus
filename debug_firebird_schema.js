const firebird = require('node-firebird');
const options = {
    host: '10.1.1.100', port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey',
    lowercase_keys: false, role: null, pageSize: 4096
};

firebird.attach(options, function (err, db) {
    if (err) throw err;
    db.query(`
        SELECT RDB$RELATION_NAME, RDB$FIELD_NAME 
        FROM RDB$RELATION_FIELDS 
        WHERE TRIM(RDB$RELATION_NAME) IN ('FORNECEDOR', 'COMPRA_PRODUTO')
    `, function (err, result) {
        if (err) throw err;
        const schema = { FORNECEDOR: [], COMPRA_PRODUTO: [] };
        result.forEach(r => {
            const t = r.RDB$RELATION_NAME.trim();
            const c = r.RDB$FIELD_NAME.trim();
            if (schema[t]) schema[t].push(c);
        });
        console.log('FORNECEDOR:', schema.FORNECEDOR.filter(c => c.includes('CODIGO')));
        console.log('COMPRA_PRODUTO:', schema.COMPRA_PRODUTO.filter(c => c.includes('COMPRA') || c.includes('ID')));
        db.detach();
    });
});
