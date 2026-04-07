require('dotenv').config({ path: '.env.local' });


const { Firebird, options: options } = require('../lib/firebird-helper');

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    // 1. Pegar um produto recente
    db.query("SELECT FIRST 1 PRODUTO_PPR, NOME_PRODUTO_PPR FROM PEDIDO_PRODUTO WHERE ANO_PPR = 2026", function (err, rows) {
        if (!rows || rows.length === 0) {
            console.log('Nenhum pedido de 2026 encontrado.');
            db.detach();
            return;
        }

        const prodCode = rows[0].PRODUTO_PPR;
        console.log(`\n🔍 Analisando Produto: ${prodCode} - ${rows[0].NOME_PRODUTO_PPR}`);

        // 2. Buscar na tabela PRODUTO o ID_PRO
        db.query("SELECT ID_PRO, CODIGO_PRO, NOME_PRO FROM PRODUTO WHERE CODIGO_PRO = ?", [prodCode], (err2, prodRows) => {
            if (!prodRows || prodRows.length === 0) {
                console.log('Produto não encontrado na tabela PRODUTO.');
                db.detach();
                return;
            }

            const prodId = prodRows[0].ID_PRO;
            console.log(`ID_PRO: ${prodId}`);

            // 3. Tentar vincular PRODUTO_PECA usando ID ou CODIGO
            console.log('\n🔍 Tentando PRODUTO_PECA...');
            db.query("SELECT * FROM PRODUTO_PECA WHERE PRODUTO_PPC = ? OR PRODUTO_PPC = ?", [prodId, prodCode], (err3, pecaRows) => {
                if (pecaRows && pecaRows.length > 0) {
                    console.log('Encontrado em PRODUTO_PECA:', pecaRows[0]);
                    const matProdId = pecaRows[0].PRODUTO_MATERIAL_PCC;

                    if (matProdId) {
                        db.query("SELECT NOME_PRO FROM PRODUTO WHERE ID_PRO = ? OR CODIGO_PRO = ?", [matProdId, matProdId], (err4, matRows) => {
                            if (matRows && matRows.length > 0) {
                                console.log(`\n✅ SUCESSO! Material identificado: ${matRows[0].NOME_PRO}`);
                            } else {
                                console.log(`Não foi possível encontrar o nome do material para o ID/Cód ${matProdId}`);
                            }
                            db.detach();
                        });
                    } else {
                        console.log('Campo PRODUTO_MATERIAL_PCC está vazio para este registro.');
                        db.detach();
                    }
                } else {
                    console.log('Não encontrado em PRODUTO_PECA.');

                    // 4. Tentar PEDIDO_PRODUTO_PECA
                    console.log('\n🔍 Tentando PEDIDO_PRODUTO_PECA...');
                    db.query("SELECT * FROM PEDIDO_PRODUTO_PECA WHERE PRODUTO_PPP = ? OR PRODUTO_PPP = ?", [prodId, prodCode], (err4, pppRows) => {
                        if (pppRows && pppRows.length > 0) {
                            console.log('Encontrado em PEDIDO_PRODUTO_PECA:', pppRows[0]);
                        } else {
                            console.log('Não encontrado em PEDIDO_PRODUTO_PECA.');
                        }
                        db.detach();
                    });
                }
            });
        });
    });
});
