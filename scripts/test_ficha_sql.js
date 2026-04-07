
const { Firebird, options: options } = require('../lib/firebird-helper');

const codigo = '273000400';

const sql = `
    SELECT FIRST 1
        F.*,
        P.NOME_PRO,
        P.PESO_LIQUIDO_PRO,
        P.PESO_BRUTO_PRO,
        P.UNIDADE_PRO,
        P.NCM_PRO,
        M.MATERIAL_MAT as NOME_MATERIAL
    FROM FICHA_TECNICA F
    LEFT JOIN PRODUTO P ON P.CODIGO_PRO = F.PRO_CODIGO_FIC
    LEFT JOIN PRODUTO_MATERIAL PM ON PM.PRODUTO_PMT = P.CODIGO_PRO
    LEFT JOIN MATERIAL M ON M.ID_MAT = PM.MAT_ID_PMT
    WHERE F.PRO_CODIGO_FIC = ?
`;

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Attach error:', err);
        return;
    }
    console.log('Querying for:', codigo);
    db.query(sql, [codigo], function (err, result) {
        if (err) {
            console.error('Query error:', err);
        } else {
            console.log('Result found:', result && result.length);
            if (result && result.length > 0) {
                console.log('Sample data:', {
                    PRO_CODIGO_FIC: result[0].PRO_CODIGO_FIC,
                    NOME_PRO: result[0].NOME_PRO,
                    NOME_MATERIAL: result[0].NOME_MATERIAL
                });
            }
        }
        db.detach();
    });
});
