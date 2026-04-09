const { Firebird, options: FIREBIRD_OPTIONS } = require('../lib/firebird-helper');

Firebird.attach(FIREBIRD_OPTIONS, (err, db) => {
    if (err) { console.error(err); process.exit(1); }
    
    const query = `
        SELECT CODIGO_SET, NOME_SET 
        FROM SETOR 
        WHERE NOME_SET IN (
            'ACABAMENTO', 'EXPEDICAO', 'FUSAO', 
            'INSPECAO DE QUALIDADE', 'MOLDAGEM MANUAL', 
            'MOLDAGEM LEVE', 'MOLDAGEM PESADA', 
            'TRATAMENTO TERMICO', 'USINAGEM', 'USINAGEM EXPEDICAO'
        )
    `;

    db.query(query, (err, rows) => {
        if (err) { console.error(err); }
        else { console.table(rows); }
        db.detach();
    });
});
