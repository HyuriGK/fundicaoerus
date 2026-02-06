
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

// Fix database URL
let url = process.env.DATABASE_URL;
if (url.startsWith("psql '")) {
    url = url.substring(6, url.length - 1);
}

const pool = new Pool({ connectionString: url });

async function run() {
    try {
        console.log("🛠️ Adding 'data_faturamento' and 'quantidade' to 'faturamento_firebird_preferencias'...");

        // Add 'quantidade' column
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faturamento_firebird_preferencias' AND column_name='quantidade') THEN
                    ALTER TABLE faturamento_firebird_preferencias ADD COLUMN quantidade DECIMAL(15,4);
                END IF;
            END
            $$;
        `);
        console.log("✅ Column 'quantidade' added (or already exists).");

        // Add 'data_faturamento' column
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faturamento_firebird_preferencias' AND column_name='data_faturamento') THEN
                    ALTER TABLE faturamento_firebird_preferencias ADD COLUMN data_faturamento DATE;
                END IF;
            END
            $$;
        `);
        console.log("✅ Column 'data_faturamento' added (or already exists).");

        // Create index for performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_faturamento_pref_detailed 
            ON faturamento_firebird_preferencias (data_faturamento, pedido, codigo_item, quantidade);
        `);
        console.log("✅ Index 'idx_faturamento_pref_detailed' created.");

    } catch (e) {
        console.error("❌ Error running migration:", e);
    } finally {
        await pool.end();
    }
}

run();
