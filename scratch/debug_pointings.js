// scratch/debug_pointings.js
const nodeFirebird = require('node-firebird');
require('dotenv').config({ path: '.env.local' });

const options = {
    host: process.env.FIREBIRD_HOST,
    port: process.env.FIREBIRD_PORT,
    database: process.env.FIREBIRD_DATABASE,
    user: process.env.FIREBIRD_USER,
    password: process.env.FIREBIRD_PASSWORD,
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

nodeFirebird.attach(options, (err, db) => {
    if (err) {
        console.error(err);
        return;
    }

    const op = '1188';
    const query = `
        SELECT SETOR_PCS, QUANTIDADE_PCS, DATA_PCS
        FROM PRODUCAO_SETOR
        WHERE CODIGO_PCS = ${op}
    `;

    db.query(query, (err, rows) => {
        if (err) {
            console.error(err);
        } else {
            console.log(`Pointings for OP ${op}:`);
            console.log(JSON.stringify(rows, null, 2));
        }
        db.detach();
    });
});
