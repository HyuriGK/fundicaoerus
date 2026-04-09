const { Firebird, options } = require('../lib/firebird-helper');

Firebird.attach(options, (err, db) => {
    if (err) { console.error(err); process.exit(1); }
    
    console.log('--- PEDIDO_PRODUTO columns ---');
    db.query('SELECT FIRST 1 * FROM PEDIDO_PRODUTO', (err, rows) => {
        if (err) console.error(err);
        else console.log(Object.keys(rows[0]).join(', '));
        
        console.log('\n--- Checking for PETR table or column ---');
        db.query("SELECT RDB$RELATION_NAME FROM RDB$RELATIONS WHERE RDB$RELATION_NAME LIKE '%PETR%'", (err, rows) => {
             if (err) console.error(err);
             else console.table(rows);
             
             db.detach();
        });
    });
});
