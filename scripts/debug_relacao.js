const Firebird = require('node-firebird');
const fb = { host: '10.1.1.100', port: 3050, database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb', user: 'SYSDBA', password: 'masterkey' };

Firebird.attach(fb, (err, db) => {
    if (err) { console.error(err); process.exit(1); }
    const sql = `SELECT FIRST 5 
        PRO_CODIGO_FIC, RELACAO_METAL_MOLDE_FIC, RELACAO_MOLDE_METAL_FIC 
        FROM FICHA_TECNICA 
        WHERE RELACAO_METAL_MOLDE_FIC IS NOT NULL OR RELACAO_MOLDE_METAL_FIC IS NOT NULL`;
    db.query(sql, (err, res) => {
        if (err) console.error(err);
        else console.log(JSON.stringify(res, null, 2));
        db.detach();
        process.exit(0);
    });
});
