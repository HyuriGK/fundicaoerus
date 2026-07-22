const pool = require('../lib/db');

function findContactId(value) {
    if (!value || typeof value !== 'object') return '';
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findContactId(item);
            if (found) return found;
        }
        return '';
    }
    for (const key of ['contactId', 'contact_id', 'idContato', 'contatoId', 'fromId', 'from_id', 'senderId', 'sender_id']) {
        if (value[key]) return String(value[key]);
    }
    for (const child of Object.values(value)) {
        const found = findContactId(child);
        if (found) return found;
    }
    return '';
}

(async () => {
    const debug = await pool.query(`
        SELECT id, created_at, body
        FROM digisac_webhook_debug
        WHERE body::text ILIKE '%.100%'
        ORDER BY id DESC
        LIMIT 5
    `);
    const closes = await pool.query(`
        SELECT contact_id, created_at
        FROM digisac_manual_close_suppressions
        ORDER BY created_at DESC
        LIMIT 5
    `);
    console.log(JSON.stringify({
        debug: debug.rows.map(row => ({
            id: row.id,
            created_at: row.created_at,
            contactId: findContactId(row.body),
            text: JSON.stringify(row.body).slice(0, 500)
        })),
        closes: closes.rows
    }, null, 2));
})()
    .catch(err => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
