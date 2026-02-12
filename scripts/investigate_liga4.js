// READ-ONLY: Check PRODUCAO.MAT_ID_PCP -> MATERIAL link and LIGA table
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
        // 1. LIGA columns
        (cb) => inspect('LIGA columns',
            `SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'LIGA' AND RDB$SYSTEM_FLAG = 0 ORDER BY RDB$FIELD_POSITION`, cb),

        // 2. LIGA sample data (just key columns)
        (cb) => inspect('LIGA sample (FIRST 10)',
            `SELECT FIRST 10 CODIGO_LIG, NOME_LIG FROM LIGA ORDER BY CODIGO_LIG`, cb),

        // 3. PRODUCAO.MAT_ID_PCP -> MATERIAL join with data from 2026
        (cb) => inspect('PRODUCAO -> MATERIAL join (2026 data, non-null MAT_ID)',
            `SELECT FIRST 10 p.CODIGO_PCP, p.PRODUTO_PCP, p.MAT_ID_PCP, m.MATERIAL_MAT, m.GRUPO_MAT
             FROM PRODUCAO p
             INNER JOIN MATERIAL m ON p.MAT_ID_PCP = m.CODIGO_MAT
             WHERE p.CODIGO_PCP IN (SELECT DISTINCT CODIGO_PCS FROM PRODUCAO_SETOR WHERE DATA_PCS >= '2026-01-01')
               AND p.MAT_ID_PCP IS NOT NULL AND p.MAT_ID_PCP > 0`, cb),

        // 4. Count PRODUCAO with MAT_ID_PCP for 2026
        (cb) => inspect('Count PRODUCAO with MAT_ID_PCP for 2026',
            `SELECT 
               COUNT(*) AS TOTAL_OPS,
               SUM(CASE WHEN MAT_ID_PCP IS NOT NULL AND MAT_ID_PCP > 0 THEN 1 ELSE 0 END) AS WITH_MAT
             FROM PRODUCAO 
             WHERE CODIGO_PCP IN (SELECT DISTINCT CODIGO_PCS FROM PRODUCAO_SETOR WHERE DATA_PCS >= '2026-01-01')`, cb),

        // 5. Check if PRODUTO_MATERIAL has relationship columns
        (cb) => inspect('PRODUTO_MATERIAL columns',
            `SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'PRODUTO_MATERIAL' AND RDB$SYSTEM_FLAG = 0 ORDER BY RDB$FIELD_POSITION`, cb),

        // 6. PRODUTO_MATERIAL sample data with product names
        (cb) => inspect('PRODUTO_MATERIAL sample (FIRST 10)',
            `SELECT FIRST 10 pm.*, m.MATERIAL_MAT 
             FROM PRODUTO_MATERIAL pm
             LEFT JOIN MATERIAL m ON pm.MAT_CODIGO_PMT = m.CODIGO_MAT
             ORDER BY pm.PRO_CODIGO_PMT`, cb),

        // 7. Check FICHA_TECNICA for any MATERIAL FK column
        (cb) => inspect('FICHA_TECNICA columns containing MAT or COD',
            `SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS 
             WHERE RDB$RELATION_NAME = 'FICHA_TECNICA' 
               AND (RDB$FIELD_NAME CONTAINING 'MAT_' OR RDB$FIELD_NAME CONTAINING 'CODIGO')
               AND RDB$SYSTEM_FLAG = 0
             ORDER BY RDB$FIELD_NAME`, cb),
    ];

    let i = 0;
    const next = () => {
        if (i >= steps.length) { db.detach(); process.exit(0); return; }
        steps[i++](next);
    };
    next();
});
