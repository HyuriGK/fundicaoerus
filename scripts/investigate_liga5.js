// READ-ONLY: Fix column names and re-query
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
        // 1. MATERIAL PK - find ID column
        (cb) => inspect('MATERIAL columns (first 5)',
            `SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS 
             WHERE RDB$RELATION_NAME = 'MATERIAL' AND RDB$SYSTEM_FLAG = 0 
             ORDER BY RDB$FIELD_POSITION
             ROWS 1 TO 5`, cb),

        // 2. LIGA sample data with just CODIGO_LIG and MAT_ID_LIG
        (cb) => inspect('LIGA sample (FIRST 10)',
            `SELECT FIRST 10 CODIGO_LIG, MAT_ID_LIG FROM LIGA ORDER BY CODIGO_LIG`, cb),

        // 3. MATERIAL sample - just ID, name, group
        (cb) => inspect('MATERIAL sample (ID_MAT, MATERIAL_MAT, GRUPO_MAT)',
            `SELECT FIRST 10 ID_MAT, MATERIAL_MAT, GRUPO_MAT FROM MATERIAL`, cb),

        // 4. PRODUCAO -> MATERIAL join using ID_MAT
        (cb) => inspect('PRODUCAO -> MATERIAL join (2026, FIRST 10)',
            `SELECT FIRST 10 p.CODIGO_PCP, p.PRODUTO_PCP, p.MAT_ID_PCP, m.MATERIAL_MAT, m.GRUPO_MAT
             FROM PRODUCAO p
             INNER JOIN MATERIAL m ON p.MAT_ID_PCP = m.ID_MAT
             WHERE p.CODIGO_PCP IN (SELECT DISTINCT CODIGO_PCS FROM PRODUCAO_SETOR WHERE DATA_PCS >= '2026-01-01')
               AND p.MAT_ID_PCP IS NOT NULL AND p.MAT_ID_PCP > 0`, cb),

        // 5. Count PRODUCAO with MAT_ID_PCP for 2026
        (cb) => inspect('Count PRODUCAO with MAT_ID_PCP (2026)',
            `SELECT 
               COUNT(*) AS TOTAL_OPS,
               SUM(CASE WHEN MAT_ID_PCP IS NOT NULL AND MAT_ID_PCP > 0 THEN 1 ELSE 0 END) AS WITH_MAT
             FROM PRODUCAO 
             WHERE CODIGO_PCP IN (SELECT DISTINCT CODIGO_PCS FROM PRODUCAO_SETOR WHERE DATA_PCS >= '2026-01-01')`, cb),

        // 6. PRODUTO_MATERIAL columns
        (cb) => inspect('PRODUTO_MATERIAL columns',
            `SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS 
             WHERE RDB$RELATION_NAME = 'PRODUTO_MATERIAL' AND RDB$SYSTEM_FLAG = 0 
             ORDER BY RDB$FIELD_POSITION`, cb),

        // 7. PRODUTO_MATERIAL sample
        (cb) => inspect('PRODUTO_MATERIAL sample (FIRST 10)',
            `SELECT FIRST 10 * FROM PRODUTO_MATERIAL`, cb),

        // 8. FICHA_TECNICA MAT columns
        (cb) => inspect('FICHA_TECNICA MAT columns',
            `SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS 
             WHERE RDB$RELATION_NAME = 'FICHA_TECNICA' 
               AND RDB$FIELD_NAME CONTAINING 'MAT'
               AND RDB$SYSTEM_FLAG = 0
             ORDER BY RDB$FIELD_NAME`, cb),

        // 9. FICHA_TECNICA MAT_ID or foreign keys
        (cb) => inspect('FICHA_TECNICA sample - MAT-related values (FIRST 5)',
            `SELECT FIRST 5 PRO_CODIGO_FIC, MAT_NOMENCLATURA_FIC FROM FICHA_TECNICA WHERE MAT_NOMENCLATURA_FIC IS NOT NULL`, cb),
    ];

    let i = 0;
    const next = () => {
        if (i >= steps.length) { db.detach(); process.exit(0); return; }
        steps[i++](next);
    };
    next();
});
