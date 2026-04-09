const { Firebird, options: FIREBIRD_OPTIONS } = require('../lib/firebird-helper');

const opId = process.argv[2] ? parseInt(process.argv[2]) : 3641;

Firebird.attach(FIREBIRD_OPTIONS, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    const query = `
        SELECT 
            ID_PCS, SETOR_PCS, QUANTIDADE_PCS, LOTE_PCS, DATA_PCS
        FROM PRODUCAO_SETOR 
        WHERE CODIGO_PCS = ?
        ORDER BY SETOR_PCS, ID_PCS
    `;

    db.query(query, [opId], function (err, result) {
        if (err) {
            console.error('Erro na query:', err);
            db.detach();
            return;
        }

        console.log(`--- Registros de PRODUCAO_SETOR para OP ${opId} ---`);
        result.forEach(row => {
            console.log(`ID: ${row.ID_PCS} | Setor: ${row.SETOR_PCS} | Qtd: ${row.QUANTIDADE_PCS} | Lote: ${row.LOTE_PCS} | Data: ${row.DATA_PCS}`);
        });

        // Summary
        const summary = {};
        result.forEach(row => {
            summary[row.SETOR_PCS] = (summary[row.SETOR_PCS] || 0) + row.QUANTIDADE_PCS;
        });
        console.log('\n--- Resumo por Setor ---');
        console.log(summary);

        db.detach();
    });
});
