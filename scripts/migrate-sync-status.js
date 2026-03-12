const pool = require('../lib/db');

async function migrate() {
    console.log('🚀 Running migration: Create sync_status table...');
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sync_status (
                screen_name VARCHAR(255) PRIMARY KEY,
                last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Table sync_status created or already exists.');
    } catch (error) {
        console.error('❌ Error during migration:', error);
    } finally {
        await pool.end();
    }
}

migrate();
