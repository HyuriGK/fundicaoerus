// READ-ONLY: Deep dive into LIGA, MATERIAL and PRODUCAO.MAT_ID_PCP
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
                rows.forEach((r, i) => {
                    console.log(`Row ${i + 1}:`, JSON.stringify(r));
                });
            }
            cb();
        });
    };

    const steps = [
        // 1. LIGA table - what does it look like?
        (cb) => inspect('LIGA table - all columns',
            `SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'LIGA' AND RDB$SYSTEM_FLAG = 0 ORDER BY RDB$FIELD_POSITION`, cb),
        // 2. LIGA table - sample data 
        (cb) => inspect('LIGA table - sample data',
            `SELECT FIRST 10 * FROM LIGA`, cb),
        // 3. PRODUCAO - check MAT_ID_PCP (this could link to MATERIAL!)
        (cb) => inspect('PRODUCAO.MAT_ID_PCP sample (non-null)',
            `SELECT FIRST 10 CODIGO_PCP, PRODUTO_PCP, MAT_ID_PCP FROM PRODUCAO WHERE MAT_ID_PCP IS NOT NULL AND MAT_ID_PCP > 0`, cb),
        // 4. MATERIAL table columns
        (cb) => inspect('MATERIAL table - all columns',
            `SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'MATERIAL' AND RDB$SYSTEM_FLAG = 0 ORDER BY RDB$FIELD_POSITION`, cb),
        // 5. MATERIAL table - sample data
        (cb) => inspect('MATERIAL table - sample data',
            `SELECT FIRST 10 * FROM MATERIAL`, cb),
        // 6. Count how many PRODUCAO have MAT_ID_PCP populated
        (cb) => inspect('PRODUCAO MAT_ID_PCP population count',
            `SELECT COUNT(*) AS TOTAL, SUM(CASE WHEN MAT_ID_PCP IS NOT NULL AND MAT_ID_PCP > 0 THEN 1 ELSE 0 END) AS WITH_MAT FROM PRODUCAO WHERE CODIGO_PCP IN (SELECT DISTINCT CODIGO_PCS FROM PRODUCAO_SETOR WHERE DATA_PCS >= '2026-01-01')`, cb),
    ];

    let i = 0;
    const next = () => {
        if (i >= steps.length) { db.detach(); process.exit(0); return; }
        steps[i++](next);
    };
    next();
});
