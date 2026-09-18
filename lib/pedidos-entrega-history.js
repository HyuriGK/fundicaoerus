const DELIVERY_HISTORY_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS pedidos_entrega_historico (
        id BIGSERIAL PRIMARY KEY,
        sync_key TEXT NOT NULL,
        data_entrega DATE,
        data_emissao DATE,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        ended_at TIMESTAMP
    );
    ALTER TABLE pedidos_entrega_historico
        ADD COLUMN IF NOT EXISTS data_emissao DATE;
    CREATE INDEX IF NOT EXISTS idx_pedidos_entrega_historico_sync_key
        ON pedidos_entrega_historico (sync_key, started_at ASC);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_entrega_historico_active
        ON pedidos_entrega_historico (sync_key)
        WHERE ended_at IS NULL;
`;

async function ensureDeliveryHistoryTable(client) {
    await client.query(DELIVERY_HISTORY_TABLE_SQL);
}

async function initializeDeliveryHistory(client, syncKey) {
    await client.query(`
        INSERT INTO pedidos_entrega_historico (sync_key, data_entrega, data_emissao, started_at)
        SELECT $1,
               LEFT(NULLIF(data->>'ENTREGA_PETR', ''), 10)::date,
               LEFT(NULLIF(data->>'ENTREGA_PETR_EMISSAO', ''), 10)::date,
               CURRENT_TIMESTAMP
        FROM firebird_sync_emissoes
        WHERE sync_key = $1
          AND NULLIF(data->>'ENTREGA_PETR', '') IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM pedidos_entrega_historico
              WHERE sync_key = $1
          )
        ON CONFLICT (sync_key) WHERE ended_at IS NULL DO NOTHING
    `, [syncKey]);
}

async function recordDeliveryHistory(client, rows) {
    if (!rows.length) return;

    const keys = rows.map(row => row.syncKey);
    const dates = rows.map(row => row.deliveryDate || null);
    const emissions = rows.map(row => row.emissionDate || null);

    await client.query(`
        WITH incoming AS (
            SELECT *
            FROM unnest($1::text[], $2::date[], $3::date[]) AS value(sync_key, data_entrega, data_emissao)
        )
        UPDATE pedidos_entrega_historico history
        SET data_emissao = incoming.data_emissao
        FROM incoming
        WHERE history.sync_key = incoming.sync_key
          AND history.ended_at IS NULL
          AND history.data_entrega IS NOT DISTINCT FROM incoming.data_entrega
          AND history.data_emissao IS NULL
          AND incoming.data_emissao IS NOT NULL
    `, [keys, dates, emissions]);

    await client.query(`
        WITH incoming AS (
            SELECT *
            FROM unnest($1::text[], $2::date[], $3::date[]) AS value(sync_key, data_entrega, data_emissao)
        )
        UPDATE pedidos_entrega_historico history
        SET ended_at = CURRENT_TIMESTAMP
        FROM incoming
          WHERE history.sync_key = incoming.sync_key
          AND history.ended_at IS NULL
          AND incoming.data_entrega IS NOT NULL
          AND (
              history.data_entrega IS DISTINCT FROM incoming.data_entrega
              OR history.data_emissao IS DISTINCT FROM incoming.data_emissao
          )
    `, [keys, dates, emissions]);

    await client.query(`
        WITH incoming AS (
            SELECT *
            FROM unnest($1::text[], $2::date[], $3::date[]) AS value(sync_key, data_entrega, data_emissao)
        )
        INSERT INTO pedidos_entrega_historico (sync_key, data_entrega, data_emissao, started_at)
        SELECT incoming.sync_key, incoming.data_entrega, incoming.data_emissao, CURRENT_TIMESTAMP
        FROM incoming
        WHERE NOT EXISTS (
            SELECT 1
            FROM pedidos_entrega_historico history
            WHERE history.sync_key = incoming.sync_key
              AND history.ended_at IS NULL
        )
          AND incoming.data_entrega IS NOT NULL
    `, [keys, dates, emissions]);
}

module.exports = { ensureDeliveryHistoryTable, initializeDeliveryHistory, recordDeliveryHistory };
