// READ-ONLY: Check PRODUTO_MATERIAL coverage for 2026 products
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

    // Step 1: Get sample product IDs from 2026 PRODUCAO_SETOR
    db.query(`SELECT FIRST 10 DISTINCT ps.CODIGO_PCS, p.PRODUTO_PCP, p.MAT_ID_PCP
              FROM PRODUCAO_SETOR ps
              INNER JOIN PRODUCAO p ON ps.CODIGO_PCS = p.CODIGO_PCP
              WHERE ps.DATA_PCS >= '2026-02-01' AND ps.DATA_PCS <= '2026-02-12'
              ORDER BY ps.CODIGO_PCS DESC`, (err, rows) => {
        if (err) { console.error('Step 1 Error:', err.message); db.detach(); return; }

        console.log('=== PRODUCAO_SETOR (Feb 2026) -> PRODUCAO (OP + PRODUCT + MAT_ID) ===');
        console.log(`Rows: ${rows.length}`);
        rows.forEach((r, i) => console.log(`  ${i + 1}:`, JSON.stringify(r)));

        // Collect product IDs
        const productIds = [...new Set(rows.map(r => r.PRODUTO_PCP).filter(Boolean))];
        console.log(`\nUnique product IDs: ${productIds.length}`);

        if (productIds.length === 0) { db.detach(); return; }
        const idList = productIds.join(',');

        // Step 2: Check PRODUTO_MATERIAL for these products
        db.query(`SELECT pm.PRODUTO_PMT, pm.MAT_ID_PMT, m.MATERIAL_MAT, m.GRUPO_MAT
                  FROM PRODUTO_MATERIAL pm
                  INNER JOIN MATERIAL m ON pm.MAT_ID_PMT = m.ID_MAT
                  WHERE pm.PRODUTO_PMT IN (${idList})`, (err, pmRows) => {
            if (err) { console.error('Step 2 Error:', err.message); db.detach(); return; }

            console.log(`\n=== PRODUTO_MATERIAL for these products ===`);
            console.log(`Rows: ${pmRows.length}`);
            pmRows.forEach((r, i) => console.log(`  ${i + 1}:`, JSON.stringify(r)));

            // Step 3: Total PRODUTO_MATERIAL count
            db.query(`SELECT COUNT(*) AS TOTAL FROM PRODUTO_MATERIAL WHERE MAT_ID_PMT IS NOT NULL AND MAT_ID_PMT > 0`, (err, countRows) => {
                if (err) { console.error('Step 3 Error:', err.message); db.detach(); return; }
                console.log(`\n=== Total PRODUTO_MATERIAL with MAT_ID ===`);
                console.log(`  Total: ${countRows[0].TOTAL}`);

                // Step 4: How many unique products in 2026 PRODUCAO_SETOR have PRODUTO_MATERIAL?
                db.query(`SELECT COUNT(DISTINCT p.PRODUTO_PCP) AS TOTAL_PRODUCTS,
                          SUM(CASE WHEN pm.MAT_ID_PMT IS NOT NULL THEN 1 ELSE 0 END) AS WITH_MAT
                          FROM (SELECT DISTINCT CODIGO_PCS FROM PRODUCAO_SETOR WHERE DATA_PCS >= '2026-01-01') ps
                          INNER JOIN PRODUCAO p ON ps.CODIGO_PCS = p.CODIGO_PCP
                          LEFT JOIN PRODUTO_MATERIAL pm ON p.PRODUTO_PCP = pm.PRODUTO_PMT`, (err, covRows) => {
                    if (err) { console.error('Step 4 Error:', err.message); db.detach(); return; }
                    console.log(`\n=== Coverage: 2026 Products with PRODUTO_MATERIAL ===`);
                    covRows.forEach((r, i) => console.log(`  ${i + 1}:`, JSON.stringify(r)));

                    db.detach();
                    process.exit(0);
                });
            });
        });
    });
});
