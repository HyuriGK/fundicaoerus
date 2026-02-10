require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const FIREBIRD_OPTIONS = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(FIREBIRD_OPTIONS, function (err, db) {
    if (err) { console.error(err); return; }

    // Find items with MULTIPLE production entries to understand the flow
    // Also check if STATUS_PCS='E' or 'N' or 'A' exists for recent pedidos
    const q1 = `
        SELECT
            PCS.ID_CODIGO_PCS,
            P.CODIGO_PPR,
            P.ANO_PPR,
            P.PRODUTO_PPR,
            COUNT(*) AS TOTAL_ENTRIES,
            SUM(CASE WHEN PCS.STATUS_PCS = 'T' THEN 1 ELSE 0 END) AS QTD_T,
            SUM(CASE WHEN PCS.STATUS_PCS = 'E' THEN 1 ELSE 0 END) AS QTD_E,
            SUM(CASE WHEN PCS.STATUS_PCS = 'N' THEN 1 ELSE 0 END) AS QTD_N,
            SUM(CASE WHEN PCS.STATUS_PCS = 'A' THEN 1 ELSE 0 END) AS QTD_A,
            SUM(CASE WHEN PCS.STATUS_PCS = 'P' THEN 1 ELSE 0 END) AS QTD_P,
            MAX(PCS.SETOR_PCS) AS MAX_SETOR
        FROM PRODUCAO_SETOR PCS
        JOIN PEDIDO_PRODUTO P ON PCS.ID_CODIGO_PCS = P.ID_PPR
        WHERE P.ANO_PPR IN (2025, 2026)
            AND (P.FATURADO_PPR <> 'T' OR P.FATURADO_PPR IS NULL)
            AND (P.STATUS_PPR <> 'C' OR P.STATUS_PPR IS NULL)
        GROUP BY PCS.ID_CODIGO_PCS, P.CODIGO_PPR, P.ANO_PPR, P.PRODUTO_PPR
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
    `;

    // Query 2: Check if CODIGO_PCS might be the OP number - same COD for different items?
    const q2 = `
        SELECT FIRST 20
            PCS.CODIGO_PCS,
            PCS.SETOR_PCS,
            PCS.STATUS_PCS,
            PCS.DATA_PCS,
            PCS.ID_CODIGO_PCS,
            P.CODIGO_PPR,
            P.PRODUTO_PPR
        FROM PRODUCAO_SETOR PCS
        JOIN PEDIDO_PRODUTO P ON PCS.ID_CODIGO_PCS = P.ID_PPR
        WHERE P.ANO_PPR IN (2025, 2026)
            AND (P.FATURADO_PPR <> 'T' OR P.FATURADO_PPR IS NULL)
            AND PCS.STATUS_PCS <> 'T'
        ORDER BY PCS.CODIGO_PCS, PCS.SETOR_PCS
    `;

    db.query(q1, function (err, r1) {
        if (err) { console.error('Q1 Error:', err); }
        else {
            console.log('=== ITEMS WITH MULTIPLE PRODUCTION ENTRIES ===');
            r1.slice(0, 15).forEach(r => {
                console.log(`  Pedido=${r.CODIGO_PPR}/${r.ANO_PPR} Prod=${r.PRODUTO_PPR} Entries=${r.TOTAL_ENTRIES} T=${r.QTD_T} E=${r.QTD_E} N=${r.QTD_N} A=${r.QTD_A} P=${r.QTD_P} MaxSetor=${r.MAX_SETOR}`);
            });
        }

        db.query(q2, function (err, r2) {
            if (err) { console.error('Q2 Error:', err); }
            else {
                console.log('\n=== NON-TERMINATED (STATUS != T) ENTRIES FOR 2025/2026 ===');
                r2.forEach(r => {
                    console.log(`  COD=${r.CODIGO_PCS} SETOR=${r.SETOR_PCS} STATUS=${r.STATUS_PCS} DATA=${r.DATA_PCS} Ped=${r.CODIGO_PPR} Prod=${r.PRODUTO_PPR}`);
                });
            }
            db.detach();
        });
    });
});
