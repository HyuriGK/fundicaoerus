const DELIVERY_HISTORY_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS pedidos_entrega_historico (
        id BIGSERIAL PRIMARY KEY,
        sync_key TEXT NOT NULL,
        data_entrega DATE,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_pedidos_entrega_historico_sync_key
        ON pedidos_entrega_historico (sync_key, started_at ASC);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_entrega_historico_active
        ON pedidos_entrega_historico (sync_key)
        WHERE ended_at IS NULL;
`;

async function ensureDeliveryHistoryTable(client) {
    await client.query(DELIVERY_HISTORY_TABLE_SQL);
}

async function recordDeliveryHistory(client, rows) {
    if (!rows.length) return;

    const keys = rows.map(row => row.syncKey);
    const dates = rows.map(row => row.deliveryDate || null);

    await client.query(`
        WITH incoming AS (
            SELECT *
            FROM unnest($1::text[], $2::date[]) AS value(sync_key, data_entrega)
        )
        UPDATE pedidos_entrega_historico history
        SET ended_at = CURRENT_TIMESTAMP
        FROM incoming
        WHERE history.sync_key = incoming.sync_key
          AND history.ended_at IS NULL
          AND history.data_entrega IS DISTINCT FROM incoming.data_entrega
    `, [keys, dates]);

    await client.query(`
        WITH incoming AS (
            SELECT *
            FROM unnest($1::text[], $2::date[]) AS value(sync_key, data_entrega)
        )
        INSERT INTO pedidos_entrega_historico (sync_key, data_entrega, started_at)
        SELECT incoming.sync_key, incoming.data_entrega, CURRENT_TIMESTAMP
        FROM incoming
        WHERE NOT EXISTS (
            SELECT 1
            FROM pedidos_entrega_historico history
            WHERE history.sync_key = incoming.sync_key
              AND history.ended_at IS NULL
        )
    `, [keys, dates]);
}

module.exports = { ensureDeliveryHistoryTable, recordDeliveryHistory };
