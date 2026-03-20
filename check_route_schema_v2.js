const Firebird = require('node-firebird');
const options = {
    host: '10.1.1.100', port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey',
    lowercase_keys: false, role: null, pageSize: 4096
};

const tables = ['MODULO_PRODUCAO', 'PROCESSO', 'OP_PROCESSO', 'FICHA_TECNICA_PROCEDIMENTO'];

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Connection failed:', err.message);
        process.exit(1);
    }
    
    console.log('Querying schema for tables:', tables.join(', '));
    
    const query = `
        SELECT RDB$RELATION_NAME as TABLE_NAME, RDB$FIELD_NAME as COLUMN_NAME 
        FROM RDB$RELATION_FIELDS 
        WHERE TRIM(RDB$RELATION_NAME) IN (${tables.map(t => `'${t}'`).join(',')})
        ORDER BY RDB$RELATION_NAME, RDB$FIELD_POSITION
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Query failed:', err.message);
            db.detach();
            process.exit(1);
        }
        
        const schema = {};
        result.forEach(r => {
            const t = r.TABLE_NAME.trim();
            const c = r.COLUMN_NAME.trim();
            if (!schema[t]) schema[t] = [];
            schema[t].push(c);
        });
        
        console.log(JSON.stringify(schema, null, 2));
        db.detach();
    });
});
