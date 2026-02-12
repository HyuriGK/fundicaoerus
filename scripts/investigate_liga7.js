// READ-ONLY: Check PRODUTO_MATERIAL and broader PRODUCAO coverage
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
            rows.forEach((r, i) => console.log(`  ${i + 1}:`, JSON.stringify(r)));
            cb();
        });
    };

    const steps = [
        // 1. PRODUTO_MATERIAL columns (fix column name issue)
        (cb) => inspect('PRODUTO_MATERIAL columns',
            `SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS 
             WHERE RDB$RELATION_NAME = 'PRODUTO_MATERIAL' AND RDB$SYSTEM_FLAG = 0
             ORDER BY RDB$FIELD_POSITION`, cb),

        // 2. PRODUTO_MATERIAL sample data
        (cb) => inspect('PRODUTO_MATERIAL sample (FIRST 5)',
            `SELECT FIRST 5 * FROM PRODUTO_MATERIAL`, cb),

        // 3. Check recent OPs (high CODIGO_PCP) with MAT_ID_PCP 
        (cb) => inspect('Recent PRODUCAO with MAT_ID_PCP (CODIGO_PCP > 100000)',
            `SELECT FIRST 10 CODIGO_PCP, PRODUTO_PCP, MAT_ID_PCP 
             FROM PRODUCAO 
             WHERE CODIGO_PCP > 100000 
             ORDER BY CODIGO_PCP DESC`, cb),

        // 4. Recent OPs in range 95000-101000 with MAT_ID_PCP
        (cb) => inspect('PRODUCAO MAT_ID_PCP for OPs in 95000-101000',
            `SELECT FIRST 10 CODIGO_PCP, PRODUTO_PCP, MAT_ID_PCP 
             FROM PRODUCAO 
             WHERE CODIGO_PCP BETWEEN 95000 AND 101000
               AND MAT_ID_PCP IS NOT NULL AND MAT_ID_PCP > 0
             ORDER BY CODIGO_PCP DESC`, cb),

        // 5. Check what OP code range exists in 2026 PRODUCAO_SETOR
        (cb) => inspect('PRODUCAO_SETOR 2026 OP range',
            `SELECT MIN(CODIGO_PCS) AS MIN_OP, MAX(CODIGO_PCS) AS MAX_OP, COUNT(DISTINCT CODIGO_PCS) AS UNIQUE_OPS
             FROM PRODUCAO_SETOR 
             WHERE DATA_PCS >= '2026-01-01'`, cb),

        // 6. Check those specific OPs in PRODUCAO with their MAT_ID_PCP
        (cb) => inspect('PRODUCAO MAT_ID_PCP for high OPs (>99000)',
            `SELECT FIRST 20 p.CODIGO_PCP, p.MAT_ID_PCP
             FROM PRODUCAO p
             WHERE p.CODIGO_PCP > 99000
             ORDER BY p.CODIGO_PCP DESC`, cb),
    ];

    let i = 0;
    const next = () => {
        if (i >= steps.length) { db.detach(); process.exit(0); return; }
        steps[i++](next);
    };
    next();
});
