// READ-ONLY: Check PRODUCAO -> MATERIAL link directly (no subquery)
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
        // 1. Simple: Get FIRST 10 PRODUCAO with MAT_ID_PCP > 0, join MATERIAL
        (cb) => inspect('PRODUCAO -> MATERIAL (any, FIRST 10)',
            `SELECT FIRST 10 p.CODIGO_PCP, p.PRODUTO_PCP, p.MAT_ID_PCP, m.MATERIAL_MAT, m.GRUPO_MAT
             FROM PRODUCAO p
             INNER JOIN MATERIAL m ON p.MAT_ID_PCP = m.ID_MAT
             WHERE p.MAT_ID_PCP IS NOT NULL AND p.MAT_ID_PCP > 0
             ORDER BY p.CODIGO_PCP DESC`, cb),

        // 2. Count total PRODUCAO and those with MAT_ID_PCP (all time)
        (cb) => inspect('Count PRODUCAO with MAT_ID_PCP (all time)',
            `SELECT 
               COUNT(*) AS TOTAL,
               SUM(CASE WHEN MAT_ID_PCP IS NOT NULL AND MAT_ID_PCP > 0 THEN 1 ELSE 0 END) AS WITH_MAT
             FROM PRODUCAO`, cb),

        // 3. Check specific OP codes we know exist in 2026 data
        // Get a few CODIGO_PCS from PRODUCAO_SETOR, then check their MAT_ID_PCP
        (cb) => inspect('Sample OPs from PRODUCAO_SETOR (2026-02)',
            `SELECT FIRST 5 DISTINCT CODIGO_PCS FROM PRODUCAO_SETOR WHERE DATA_PCS >= '2026-02-01' AND DATA_PCS <= '2026-02-28'`, cb),
    ];

    let i = 0;
    const next = () => {
        if (i >= steps.length) {
            // Step 4: use the OPs from step 3 to check MAT_ID_PCP
            // We already have the sample, let's just check those specific OPs
            db.query(`SELECT FIRST 5 DISTINCT CODIGO_PCS FROM PRODUCAO_SETOR WHERE DATA_PCS >= '2026-02-01' AND DATA_PCS <= '2026-02-28'`, (err, ops) => {
                if (err || !ops || ops.length === 0) {
                    console.log('\nNo OPs found for step 4');
                    db.detach(); process.exit(0); return;
                }
                const opIds = ops.map(o => o.CODIGO_PCS).join(',');
                db.query(`SELECT p.CODIGO_PCP, p.PRODUTO_PCP, p.MAT_ID_PCP, m.MATERIAL_MAT, m.GRUPO_MAT
                          FROM PRODUCAO p
                          LEFT JOIN MATERIAL m ON p.MAT_ID_PCP = m.ID_MAT
                          WHERE p.CODIGO_PCP IN (${opIds})`, (err, rows) => {
                    if (err) { console.error('Error step 4:', err.message); db.detach(); process.exit(0); return; }
                    console.log(`\n=== PRODUCAO -> MATERIAL for Feb 2026 OPs (${opIds}) ===`);
                    console.log(`Rows: ${rows.length}`);
                    rows.forEach((r, i) => console.log(`  ${i + 1}:`, JSON.stringify(r)));

                    // Step 5: Also check PRODUTO_MATERIAL for same products
                    const prodIds = [...new Set(rows.map(r => r.PRODUTO_PCP).filter(Boolean))];
                    if (prodIds.length === 0) { db.detach(); process.exit(0); return; }
                    const prodList = prodIds.join(',');
                    db.query(`SELECT pm.PRO_CODIGO_PMT, pm.MAT_CODIGO_PMT, m.MATERIAL_MAT, m.GRUPO_MAT
                              FROM PRODUTO_MATERIAL pm
                              LEFT JOIN MATERIAL m ON pm.MAT_CODIGO_PMT = m.ID_MAT
                              WHERE pm.PRO_CODIGO_PMT IN (${prodList})`, (err, pmRows) => {
                        if (err) { console.error('Error step 5:', err.message); db.detach(); process.exit(0); return; }
                        console.log(`\n=== PRODUTO_MATERIAL for products of Feb 2026 OPs ===`);
                        console.log(`Rows: ${pmRows.length}`);
                        pmRows.forEach((r, i) => console.log(`  ${i + 1}:`, JSON.stringify(r)));
                        db.detach(); process.exit(0);
                    });
                });
            });
            return;
        }
        steps[i++](next);
    };
    next();
});
