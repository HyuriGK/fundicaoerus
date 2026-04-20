const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
const { Firebird, options: FIREBIRD_OPTIONS } = require(path.join(process.cwd(), 'lib/firebird-helper'));

async function checkFirebird() {
    return new Promise((resolve, reject) => {
        Firebird.attach(FIREBIRD_OPTIONS, (err, db) => {
            if (err) return reject(err);
            
            const query = `
                SELECT PCP_CODIGO_PCPR, PPR_CODIGO_PCPR, PPR_ANO_PCPR, PPR_ITEM_PCPR, PPR_EMPRESA_PCPR
                FROM PRODUCAO_PEDIDO
                WHERE (PPR_CODIGO_PCPR = 1003 AND PPR_ANO_PCPR = 2025 AND PPR_ITEM_PCPR = 2 AND PPR_EMPRESA_PCPR = 10)
                   OR (PPR_CODIGO_PCPR = 301 AND PPR_ANO_PCPR = 2026 AND PPR_ITEM_PCPR = 1 AND PPR_EMPRESA_PCPR = 10)
            `;
            
            db.query(query, (err, res) => {
                db.detach();
                if (err) return reject(err);
                resolve(res);
            });
        });
    });
}

checkFirebird().then(res => {
    console.log(JSON.stringify(res, null, 2));
}).catch(err => {
    console.error(err);
});
