const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
const { Firebird, options: FIREBIRD_OPTIONS } = require(path.join(process.cwd(), 'lib/firebird-helper'));

async function checkOpStatus() {
    return new Promise((resolve, reject) => {
        Firebird.attach(FIREBIRD_OPTIONS, (err, db) => {
            if (err) return reject(err);
            
            const query = `
                SELECT DISTINCT STATUS_PCP FROM PRODUCAO
            `;
            
            db.query(query, (err, res) => {
                db.detach();
                if (err) return reject(err);
                resolve(res);
            });
        });
    });
}

checkOpStatus().then(res => {
    console.log(JSON.stringify(res, null, 2));
}).catch(err => {
    console.error(err);
});
