const Firebird = require('node-firebird');
const fb = { host: '10.1.1.100', port: 3050, database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb', user: 'SYSDBA', password: 'masterkey' };

Firebird.attach(fb, (err, db) => {
    if (err) { console.error(err); process.exit(1); }
    const sql = `SELECT FIRST 5 
        F.PRO_CODIGO_FIC, P.NOME_PRO, C.RAZAO_SOCIAL_CLI,
        F.RELACAO_METAL_MOLDE_FIC, F.RELACAO_MOLDE_METAL_FIC
        FROM FICHA_TECNICA F
        LEFT JOIN PRODUTO P ON P.CODIGO_PRO = F.PRO_CODIGO_FIC
        LEFT JOIN CLIENTE C ON C.CODIGO_CLI = F.CLI_CODIGO_FIC
        WHERE P.NOME_PRO IS NOT NULL AND C.RAZAO_SOCIAL_CLI IS NOT NULL`;
    db.query(sql, (err, res) => {
        if (err) console.error(err);
        else console.log(JSON.stringify(res, null, 2));
        db.detach();
        process.exit(0);
    });
});
