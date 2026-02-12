// READ-ONLY: Inspect LIGA, PRODUTO_MATERIAL and MATERIAL tables
require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const fbOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(fbOptions, (err, db) => {
    if (err) { console.error(err); process.exit(1); }

    const inspect = (label, query, cb) => {
        db.query(query, (err, rows) => {
            if (err) { console.error(`Error [${label}]:`, err.message); cb(); return; }
            console.log(`\n=== ${label} ===`);
            console.log(`Rows: ${rows.length}`);
            if (rows.length > 0) {
                console.log('Columns:', Object.keys(rows[0]).join(', '));
                // Show first 3 rows
                rows.slice(0, 3).forEach((r, i) => {
                    console.log(`Row ${i + 1}:`, JSON.stringify(r));
                });
            }
            cb();
        });
    };

    const steps = [
        (cb) => inspect('LIGA table (FIRST 5)', 'SELECT FIRST 5 * FROM LIGA', cb),
        (cb) => inspect('PRODUTO_MATERIAL table (FIRST 5)', 'SELECT FIRST 5 * FROM PRODUTO_MATERIAL', cb),
        (cb) => inspect('MATERIAL table (FIRST 5)', 'SELECT FIRST 5 * FROM MATERIAL', cb),
        (cb) => inspect('FICHA_TECNICA -> LIGA relationship check',
            `SELECT FIRST 1 rf.RDB$FIELD_NAME 
             FROM RDB$RELATION_FIELDS rf 
             WHERE rf.RDB$RELATION_NAME = 'FICHA_TECNICA' 
               AND (rf.RDB$FIELD_NAME CONTAINING 'LIGA' OR rf.RDB$FIELD_NAME CONTAINING 'LIG_')
               AND rf.RDB$SYSTEM_FLAG = 0`, cb),
        (cb) => inspect('FICHA_TECNICA columns with LIG/MAT',
            `SELECT RDB$FIELD_NAME 
             FROM RDB$RELATION_FIELDS 
             WHERE RDB$RELATION_NAME = 'FICHA_TECNICA' 
               AND (RDB$FIELD_NAME CONTAINING 'LIG' 
                    OR RDB$FIELD_NAME CONTAINING 'MAT'
                    OR RDB$FIELD_NAME CONTAINING 'NORMA'
                    OR RDB$FIELD_NAME CONTAINING 'TIPO')
               AND RDB$SYSTEM_FLAG = 0
             ORDER BY RDB$FIELD_NAME`, cb),
        (cb) => inspect('PRODUCAO columns for LIGA',
            `SELECT RDB$FIELD_NAME 
             FROM RDB$RELATION_FIELDS 
             WHERE RDB$RELATION_NAME = 'PRODUCAO' 
               AND (RDB$FIELD_NAME CONTAINING 'LIG' 
                    OR RDB$FIELD_NAME CONTAINING 'MAT')
               AND RDB$SYSTEM_FLAG = 0`, cb),
    ];

    let i = 0;
    const next = () => {
        if (i >= steps.length) { db.detach(); process.exit(0); return; }
        steps[i++](next);
    };
    next();
});
