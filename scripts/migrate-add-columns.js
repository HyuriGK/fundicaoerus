require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');

(async () => {
    try {
        console.log('Migrating Postgres table...');

        await pool.query(`
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE producao_apontada_sincronizada ADD COLUMN op VARCHAR(50);
                    RAISE NOTICE 'Column op added';
                EXCEPTION
                    WHEN duplicate_column THEN RAISE NOTICE 'Column op already exists';
                END;
                BEGIN
                    ALTER TABLE producao_apontada_sincronizada ADD COLUMN codigo_peca VARCHAR(50);
                    RAISE NOTICE 'Column codigo_peca added';
                EXCEPTION
                    WHEN duplicate_column THEN RAISE NOTICE 'Column codigo_peca already exists';
                END;
            END $$;
        `);

        console.log('Migration complete.');
        process.exit(0);
    } catch (err) {
        console.error('Migration error:', err);
        process.exit(1);
    }
})();
