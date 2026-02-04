require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const options = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(options, function (err, db) {
    if (err) {
        console.error('❌ Erro ao conectar:', err);
        return;
    }

    const prodCode = '252023600';
    db.query("SELECT * FROM PRODUTO WHERE CODIGO_PRO = ?", [prodCode], (err, rows) => {
        if (rows && rows.length > 0) {
            const row = rows[0];
            console.log(`\nScan de colunas para o produto ${prodCode}:`);
            for (const [key, value] of Object.entries(row)) {
                if (value && typeof value === 'string' && (value.includes('GG') || value.includes('20'))) {
                    console.log(`[HINT] ${key}: ${value}`);
                }
            }
        }

        // Também olhar PRODUTO_COMPLEMENTO
        db.query("SELECT * FROM PRODUTO_COMPLEMENTO WHERE CODIGO_PCM = ?", [prodCode], (err2, rows2) => {
            if (rows2 && rows2.length > 0) {
                const row = rows2[0];
                console.log(`\nScan de colunas em COMPLEMENTO:`);
                for (const [key, value] of Object.entries(row)) {
                    if (value && typeof value === 'string' && (value.includes('GG') || value.includes('20'))) {
                        console.log(`[HINT] ${key}: ${value}`);
                    }
                }
            }
            db.detach();
        });
    });
});
