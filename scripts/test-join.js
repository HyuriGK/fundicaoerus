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

    // Test 1: Check if PRODUCAO_SETOR.CODIGO_PCS = PRODUCAO.CODIGO_PCP
    const q1 = `
        SELECT FIRST 10
            PCS.CODIGO_PCS,
            PCS.SETOR_PCS,
            PCS.STATUS_PCS,
            PC.CODIGO_PCP,
            PC.PRODUTO_PCP,
            PC.PEDIDO_PCP,
            PC.STATUS_PCP
        FROM PRODUCAO_SETOR PCS
        JOIN PRODUCAO PC ON PCS.CODIGO_PCS = PC.CODIGO_PCP
            AND PCS.EMPRESA_PCS = PC.EMPRESA_PCP
        WHERE PCS.DATA_PCS > '2025-01-01'
        ORDER BY PCS.ID_PCS DESC
    `;

    // Test 2: Sample PRODUCAO data for recent entries
    const q2 = `
        SELECT FIRST 10
            PC.CODIGO_PCP,
            PC.PRODUTO_PCP,
            PC.PEDIDO_PCP,
            PC.ANO_PCP,
            PC.ITEM_PCP,
            PC.STATUS_PCP,
            PC.DATA_PCP
        FROM PRODUCAO PC
        WHERE PC.STATUS_PCP NOT IN ('T', 'C', 'F')
        ORDER BY PC.CODIGO_PCP DESC
    `;

    db.query(q1, function (err, r1) {
        if (err) { console.error('Q1 Error:', err.message); }
        else {
            console.log('=== PRODUCAO_SETOR.CODIGO_PCS -> PRODUCAO.CODIGO_PCP ===');
            r1.forEach(r => {
                console.log(`  PCS.COD=${r.CODIGO_PCS} SETOR=${r.SETOR_PCS} ST_PCS=${r.STATUS_PCS} | PC.COD=${r.CODIGO_PCP} PROD=${r.PRODUTO_PCP} PED=${r.PEDIDO_PCP} ST_PC=${r.STATUS_PCP}`);
            });
        }

        db.query(q2, function (err, r2) {
            if (err) { console.error('Q2 Error:', err.message); }
            else {
                console.log('\n=== PRODUCAO recent active entries ===');
                r2.forEach(r => {
                    console.log(`  OP=${r.CODIGO_PCP} PROD=${r.PRODUTO_PCP} PED=${r.PEDIDO_PCP}/${r.ANO_PCP} ITEM=${r.ITEM_PCP} ST=${r.STATUS_PCP} DATA=${r.DATA_PCP}`);
                });
            }
            db.detach();
        });
    });
});
