require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096, wireCrypt: true
};

console.log('Attaching...');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Error connecting:', err);
        return;
    }

    console.log('Connected. Testing NO ORDER query...');

    // Removed ORDER BY
    const query = `
        SELECT
            pmv.CODIGO_PMV,
            pmv.DATA_PMV,
            pmv.QUANTIDADE_PMV,
            pmv.CODIGO_PRODUCAO_PMV,
            pcs.DATA_HORA_FIM_PCS,
            s.NOME_SET,
            p.NOME_PRO,
            p.PESO_LIQUIDO_PRO
        FROM PRODUTO_MOVIMENTACAO pmv
        LEFT JOIN PRODUCAO_SETOR pcs ON pmv.CODIGO_PRODUCAO_PMV = pcs.CODIGO_PCS
        LEFT JOIN SETOR s ON pmv.SETOR_PRODUCAO_PMV = s.CODIGO_SET
        LEFT JOIN PRODUTO p ON pmv.PRODUTO_PMV = p.CODIGO_PRO
        WHERE pmv.DATA_PMV >= '2026-01-01'
        AND pmv.CODIGO_PRODUCAO_PMV IS NOT NULL
    `;

    console.time('No_Order_Query');
    db.query(query, function (err, res) {
        console.timeEnd('No_Order_Query');
        if (err) console.error(err);
        else console.log(`Returned ${res.length} rows`);
        db.detach();
    });
});
