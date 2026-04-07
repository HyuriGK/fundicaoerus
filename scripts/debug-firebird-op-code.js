require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');
// Hardcoded config from sync script
const fbOptions = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

if (!fbOptions.host) {
    console.error('❌ Could not parse Firebird config. Check .env.local');
    // console.log('Env:', process.env); // Be careful printing env
    process.exit(1);
}

Firebird.attach(fbOptions, function (err, db) {
    if (err) {
        console.error('❌ Firebird Connection Error:', err);
        process.exit(1);
    }
    console.log('✅ Firebird attached. Fetching sample raw data...');

    // Fetch a few recent movements inside the sync range (2026+)
    const query = `
        SELECT FIRST 5
            PMV.CODIGO_PMV,
            PMV.CODIGO_PRODUCAO_PMV,
            PMV.PRODUTO_PMV,
            PCS.CODIGO_PCS,
            PCS.LOTE_PCS,
            PCS.OBSERVACAO_PCS,
            P.CODIGO_PRO,
            P.REFERENCIA_PRO,
            P.NOME_PRO
        FROM PRODUTO_MOVIMENTACAO PMV
        LEFT JOIN PRODUCAO_SETOR PCS ON PCS.CODIGO_PCS = PMV.CODIGO_PRODUCAO_PMV
        LEFT JOIN PRODUTO P ON P.CODIGO_PRO = PMV.PRODUTO_PMV
        WHERE PMV.DATA_PMV >= '2026-01-01'
        AND PMV.CODIGO_PRODUCAO_PMV IS NOT NULL
    `;

    db.query(query, (err, rows) => {
        if (err) {
            console.error('Error querying:', err);
            db.detach();
            return;
        }

        console.table(rows.map(r => ({
            ID_PMV: r.CODIGO_PMV,
            ID_PROD: r.CODIGO_PRODUCAO_PMV,
            PCS_CODIGO_PCS: r.CODIGO_PCS, // Expected OP?
            PCS_LOTE: r.LOTE_PCS,
            PCS_OBS: r.OBSERVACAO_PCS, // Maybe here?
            PRO_COD: r.CODIGO_PRO,
            PRO_REF: r.REFERENCIA_PRO, // Expected Code?
            PRO_NOME: r.NOME_PRO
        })));

        db.detach();
    });
});
