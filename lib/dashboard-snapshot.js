const pool = require('./db');

async function ensureDashboardSnapshotsTable(client = pool) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS dashboard_snapshots (
            snapshot_key TEXT PRIMARY KEY,
            payload JSONB NOT NULL,
            source_status JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function getDashboardSnapshot(snapshotKey = 'global') {
    await ensureDashboardSnapshotsTable();
    const result = await pool.query(
        'SELECT payload, source_status, updated_at FROM dashboard_snapshots WHERE snapshot_key = $1',
        [snapshotKey]
    );
    return result.rows[0] || null;
}

async function publishDashboardSnapshot(snapshotKey, payload, sourceStatus = {}) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureDashboardSnapshotsTable(client);
        await client.query(`
            INSERT INTO dashboard_snapshots (snapshot_key, payload, source_status, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (snapshot_key) DO UPDATE SET
                payload = EXCLUDED.payload,
                source_status = EXCLUDED.source_status,
                updated_at = EXCLUDED.updated_at
        `, [snapshotKey, payload, sourceStatus]);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { ensureDashboardSnapshotsTable, getDashboardSnapshot, publishDashboardSnapshot };
