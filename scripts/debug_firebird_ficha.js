const Firebird = require('node-firebird');
const fb = { host: 'Desktop-dqarv0d', port: 3050, database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb', user: 'SYSDBA', password: 'masterkey' };

Firebird.attach(fb, (err, db) => {
    if (err) { console.error(err); process.exit(1); }
    const sql = `SELECT FIRST 5 
        PRO_CODIGO_FIC, CLI_CODIGO_FIC, RELACAO_MOLDE_METAL_FIC, 
        CAVIDADE_PESO_BOLO_FIC, PESO_TAMPA_FIC, PESO_FUNDO_FIC, 
        FORNECIMENTO_FIC, TIPO_MODELO_FIC 
        FROM FICHA_TECNICA 
        WHERE RELACAO_MOLDE_METAL_FIC IS NOT NULL OR CLI_CODIGO_FIC IS NOT NULL`;
    db.query(sql, (err, res) => {
        if (err) console.error(err);
        else console.log(JSON.stringify(res, null, 2));
        db.detach();
        process.exit(0);
    });
});
