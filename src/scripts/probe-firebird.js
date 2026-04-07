
const Firebird = require('node-firebird');

const firebirdOptions = {
    host: 'Desktop-dqarv0d',
    port: 3050,
    database: '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096, wireCrypt: true
};

function probeTable(tableName) {
    return new Promise((resolve, reject) => {
        Firebird.attach(firebirdOptions, function (err, db) {
            if (err) return reject(err);

            const query = `SELECT FIRST 1 * FROM ${tableName}`;
            db.query(query, function (err, result) {
                db.detach();
                if (err) return reject(err);
                if (result.length > 0) {
                    resolve(Object.keys(result[0]));
                } else {
                    resolve([]);
                }
            });
        });
    });
}

(async () => {
    try {
        console.log('Probing PEDIDO...');
        const colsPedido = await probeTable('PEDIDO');
        console.log('PEDIDO columns:', colsPedido.join(', '));
    } catch (err) {
        console.error('Error probing:', err);
    }
})();
