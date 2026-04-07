
const Firebird = require('node-firebird');

const options = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('Connection Error:', err);
        return;
    }

    const query = `
        SELECT RDB$RELATION_NAME 
        FROM RDB$RELATIONS 
        WHERE RDB$SYSTEM_FLAG = 0 
        AND RDB$VIEW_BLR IS NULL
        ORDER BY RDB$RELATION_NAME
    `;

    db.query(query, function (err, result) {
        if (err) {
            console.error('Query Error:', err);
            db.detach();
            return;
        }

        console.log('Tables found:', result.length);
        const tables = result.map(row => row.RDB$RELATION_NAME.trim());

        // Filter for terms like 'SETOR'
        const setorTables = tables.filter(t => t.includes('SETOR'));
        console.log('Tables with "SETOR":', setorTables);

        // Also print first 50 tables just in case
        // console.log('All Tables:', tables.slice(0, 50)); 

        db.detach();
    });
});
