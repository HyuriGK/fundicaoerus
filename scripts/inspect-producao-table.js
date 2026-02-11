require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

// Hardcoded config from sync script
const fbOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(fbOptions, function (err, db) {
    if (err) {
        console.error('❌ Firebird Connection Error:', err);
        process.exit(1);
    }
    console.log('✅ Firebird attached.');

    // 1. Check if PRODUCAO table exists and get sample data
    const queryProducao = `
        SELECT FIRST 5 * FROM PRODUCAO
    `;

    db.query(queryProducao, (err, rows) => {
        if (err) {
            console.error('❌ Error querying PRODUCAO (Table might not exist):', err.message);
        } else {
            console.log('✅ PRODUCAO Table Data (First 5):');
            if (rows.length > 0) {
                // Log keys to see column names
                console.log('Columns:', Object.keys(rows[0]));
                console.table(rows);
            } else {
                console.log('Table exists but is empty.');
            }
        }

        // 2. Check PRODUTO_MOVIMENTACAO values again for user hypothesis
        const queryPMV = `
            SELECT FIRST 5 
                CODIGO_PMV, 
                CODIGO_PRODUCAO_PMV, 
                PRODUTO_PMV 
            FROM PRODUTO_MOVIMENTACAO
            WHERE DATA_PMV >= '2026-01-01'
            AND CODIGO_PRODUCAO_PMV IS NOT NULL
        `;

        db.query(queryPMV, (err, rows) => {
            if (err) console.error('Error querying PMV:', err);
            else {
                console.log('✅ PRODUTO_MOVIMENTACAO Sample (User Hypothesis Check):');
                console.table(rows);
            }
            db.detach();
        });
    });
});
