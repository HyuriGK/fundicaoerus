require('dotenv').config({ path: '.env.local' });


const { Firebird, options: options } = require('../lib/firebird-helper');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    const prodId = 51181;
    const prodCode = '252023600';

    console.log(`🔍 Buscando material em PRODUTO_MATERIAL para ID: ${prodId} ou Cód: ${prodCode}`);

    db.query("SELECT * FROM PRODUTO_MATERIAL WHERE PRODUTO_PMT = ? OR PRODUTO_PMT = ?", [prodId, prodCode], (err, rows) => {
        if (rows && rows.length > 0) {
            console.log('\nEncontrado em PRODUTO_MATERIAL:', rows[0]);
            const matId = rows[0].MAT_ID_PMT;

            if (matId) {
                db.query("SELECT MATERIAL_MAT FROM MATERIAL WHERE ID_MAT = ?", [matId], (err2, matRows) => {
                    if (matRows && matRows.length > 0) {
                        console.log(`\n✅ SUCESSO! Material identificado: ${matRows[0].MATERIAL_MAT}`);
                    } else {
                        console.log(`Não foi possível encontrar o nome do material para o ID ${matId} na tabela MATERIAL.`);
                    }
                    db.detach();
                });
            } else {
                console.log('MAT_ID_PMT está vazio.');
                db.detach();
            }
        } else {
            console.log('Não encontrado em PRODUTO_MATERIAL.');
            db.detach();
        }
    });
});
