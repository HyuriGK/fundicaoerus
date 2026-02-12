// READ-ONLY investigation: Find tables/columns related to Liga/Material
require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');

const fbOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

Firebird.attach(fbOptions, function (err, db) {
    if (err) { console.error(err); process.exit(1); }

    // 1. Find all tables with "LIGA" or "MATERIAL" or "MAT" in their name
    const q1 = `
        SELECT RDB$RELATION_NAME 
        FROM RDB$RELATIONS 
        WHERE RDB$SYSTEM_FLAG = 0
          AND (RDB$RELATION_NAME CONTAINING 'LIGA' 
               OR RDB$RELATION_NAME CONTAINING 'MATERIAL'
               OR RDB$RELATION_NAME CONTAINING 'COMPOSI')
        ORDER BY RDB$RELATION_NAME
    `;

    db.query(q1, (err, tables) => {
        if (err) { console.error('Error q1:', err); db.detach(); return; }
        console.log('=== TABLES with LIGA/MATERIAL/COMPOSI in name ===');
        tables.forEach(t => console.log(' -', t.RDB$RELATION_NAME.trim()));
        if (tables.length === 0) console.log(' (none found)');

        // 2. Find columns with "LIGA" or "MATERIAL" in their name across ALL tables
        const q2 = `
            SELECT RDB$RELATION_NAME, RDB$FIELD_NAME
            FROM RDB$RELATION_FIELDS
            WHERE RDB$SYSTEM_FLAG = 0
              AND (RDB$FIELD_NAME CONTAINING 'LIGA' 
                   OR RDB$FIELD_NAME CONTAINING 'MATERIAL'
                   OR RDB$FIELD_NAME CONTAINING 'COMPOSI')
            ORDER BY RDB$RELATION_NAME, RDB$FIELD_NAME
        `;

        db.query(q2, (err, cols) => {
            if (err) { console.error('Error q2:', err); db.detach(); return; }
            console.log('\n=== COLUMNS with LIGA/MATERIAL/COMPOSI in name ===');
            cols.forEach(c => console.log(` - ${c.RDB$RELATION_NAME.trim()}.${c.RDB$FIELD_NAME.trim()}`));
            if (cols.length === 0) console.log(' (none found)');

            // 3. Check PRODUTO columns for anything liga/material related
            const q3 = `
                SELECT RDB$FIELD_NAME 
                FROM RDB$RELATION_FIELDS 
                WHERE RDB$RELATION_NAME = 'PRODUTO' 
                  AND RDB$SYSTEM_FLAG = 0
                ORDER BY RDB$FIELD_POSITION
            `;

            db.query(q3, (err, prodCols) => {
                if (err) { console.error('Error q3:', err); db.detach(); return; }
                console.log('\n=== ALL COLUMNS in PRODUTO ===');
                prodCols.forEach(c => console.log(' -', c.RDB$FIELD_NAME.trim()));

                db.detach();
                process.exit(0);
            });
        });
    });
});
