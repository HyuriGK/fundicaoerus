
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

Firebird.attach(fbOptions, function (err, db) {
    if (err) throw err;

    // 1. Get a sample from PRODUCAO_SETOR
    db.query('SELECT FIRST 1 CODIGO_PCS FROM PRODUCAO_SETOR WHERE DATA_PCS >= \'2025-01-01\'', (err, rows) => {
        if (err || rows.length === 0) {
            console.error('No production records found.');
            db.detach();
            return;
        }
        const opId = rows[0].CODIGO_PCS;
        console.log('Sample OP ID:', opId);

        // 2. Lookup in PRODUCAO
        db.query('SELECT CODIGO_PCP, PRODUTO_PCP, PEDIDO_PCP, ANO_PCP, EMPRESA_PCP FROM PRODUCAO WHERE CODIGO_PCP = ?', [opId], (err, prods) => {
            if (err) console.error(err);
            console.log('PRODUCAO Sample:', prods[0]);

            if (prods.length > 0 && prods[0].PEDIDO_PCP) {
                const prod = prods[0];
                // 3. Lookup in PEDIDO
                db.query('SELECT CODIGO_PED, ANO_PED, EMPRESA_PED, CLIENTE_PED FROM PEDIDO WHERE CODIGO_PED = ? AND ANO_PED = ? AND EMPRESA_PED = ?',
                    [prod.PEDIDO_PCP, prod.ANO_PCP, prod.EMPRESA_PCP], (err, peds) => {
                        if (err) console.error(err);
                        console.log('PEDIDO Sample:', peds[0]);

                        if (peds.length > 0 && peds[0].CLIENTE_PED) {
                            // 4. Lookup in CLIENTE
                            db.query('SELECT RAZAO_SOCIAL_CLI FROM CLIENTE WHERE CODIGO_CLI = ?', [peds[0].CLIENTE_PED], (err, clis) => {
                                if (err) console.error(err);
                                console.log('CLIENTE Sample:', clis[0]);
                                db.detach();
                            });
                        } else {
                            console.log('PEDIDO not found or has no CLIENTE_PED.');
                            db.detach();
                        }
                    });
            } else {
                console.log('PRODUCAO not found or has no PEDIDO_PCP.');
                db.detach();
            }
        });
    });
});
