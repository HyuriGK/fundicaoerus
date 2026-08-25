const pool = require('../../lib/db');
const { Firebird, options: firebirdOptions } = require('../../lib/firebird-helper');
const { randomUUID } = require('crypto');

const clean = value => {
    if (value === null || value === undefined) return null;
    const text = String(value).replace(/\0/g, '').trim();
    return text === '' ? null : text;
};

const toDate = value => {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
};

const ufMap = {
    11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
    21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
    31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP',
    41: 'PR', 42: 'SC', 43: 'RS',
    50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
};

const ufCenters = {
    11: { lat: -10.8, lng: -63.3 }, 12: { lat: -9.0, lng: -70.0 }, 13: { lat: -4.0, lng: -63.0 },
    14: { lat: 2.0, lng: -61.3 }, 15: { lat: -3.8, lng: -52.5 }, 16: { lat: 1.4, lng: -51.8 },
    17: { lat: -10.2, lng: -48.3 }, 21: { lat: -5.0, lng: -45.0 }, 22: { lat: -7.0, lng: -42.0 },
    23: { lat: -5.2, lng: -39.5 }, 24: { lat: -5.8, lng: -36.6 }, 25: { lat: -7.1, lng: -36.8 },
    26: { lat: -8.3, lng: -37.8 }, 27: { lat: -9.6, lng: -36.7 }, 28: { lat: -10.6, lng: -37.4 },
    29: { lat: -12.7, lng: -41.7 }, 31: { lat: -18.5, lng: -44.0 }, 32: { lat: -19.6, lng: -40.7 },
    33: { lat: -22.2, lng: -42.8 }, 35: { lat: -22.2, lng: -48.7 }, 41: { lat: -24.8, lng: -51.6 },
    42: { lat: -27.2, lng: -50.2 }, 43: { lat: -30.0, lng: -53.0 }, 50: { lat: -20.5, lng: -54.8 },
    51: { lat: -13.0, lng: -56.0 }, 52: { lat: -16.0, lng: -49.8 }, 53: { lat: -15.8, lng: -47.9 }
};

function parseGeo(value, ufCode, axis) {
    const text = clean(value);
    if (!text) return null;
    const raw = Number(text.replace(',', '.'));
    if (!Number.isFinite(raw)) return null;
    const bounds = axis === 'lat' ? [-35, 7] : [-75, -32];
    const center = ufCenters[ufCode]?.[axis] ?? (axis === 'lat' ? -15 : -54);
    const candidates = [raw, raw / 10, raw / 100, raw / 1000, raw / 10000]
        .filter(n => n >= bounds[0] && n <= bounds[1]);
    if (!candidates.length) return null;
    return candidates.sort((a, b) => Math.abs(a - center) - Math.abs(b - center))[0];
}

const firebirdSelect = `
    SELECT
        CL.EMPRESA_CLI,
        CL.CODIGO_CLI,
        CL.RAZAO_SOCIAL_CLI,
        CL.FANTASIA_CLI,
        CL.ATIVO_CLI,
        CL.BLOQUEADO_CLI,
        CL.CNPJ_CPF_CLI,
        CL.IE_RG_CLI,
        CL.CONTATO_CLI,
        CL.FONE1_CLI,
        CL.FONE2_CLI,
        CL.EMAIL_CLI,
        CL.EMAIL_COMERCIAL_CLI,
        CL.EMAIL_NFE_CLI,
        CL.CIDADE_CLI,
        CID.NOME_CID AS CIDADE_NOME,
        CID.UF_CID AS CIDADE_UF_CODIGO,
        CID.LATITUDE_CID AS CIDADE_LATITUDE,
        CID.LONGITUDE_CID AS CIDADE_LONGITUDE,
        CL.CEP_CLI,
        CL.LOGRADOURO_CLI,
        CL.NUMERO_CLI,
        CL.BAIRRO_CLI,
        CL.DATA_CLI,
        CL.DATA_INATIVACAO_CLI,
        CL.MOTIVO_BLOQUEIO_CLI,
        CL.OBSERVACAO_IMPORTANTE_CLI
    FROM CLIENTE CL
    LEFT JOIN CIDADE CID ON CID.CODIGO_CID = CL.CIDADE_CLI
    ORDER BY CL.RAZAO_SOCIAL_CLI
`;

async function ensureTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS clientes_firebird_sync (
            empresa INTEGER NOT NULL,
            codigo INTEGER NOT NULL,
            razao_social TEXT,
            fantasia TEXT,
            ativo BOOLEAN DEFAULT FALSE,
            bloqueado BOOLEAN DEFAULT FALSE,
            cnpj_cpf TEXT,
            ie_rg TEXT,
            contato TEXT,
            telefone1 TEXT,
            telefone2 TEXT,
            email TEXT,
            cidade_codigo INTEGER,
            cidade_nome TEXT,
            cidade_uf TEXT,
            cidade_latitude NUMERIC,
            cidade_longitude NUMERIC,
            cep TEXT,
            logradouro TEXT,
            numero TEXT,
            bairro TEXT,
            data_cadastro DATE,
            data_inativacao DATE,
            motivo_bloqueio TEXT,
            observacao TEXT,
            synced_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (empresa, codigo)
        )
    `);
    await client.query('ALTER TABLE clientes_firebird_sync ADD COLUMN IF NOT EXISTS cidade_nome TEXT');
    await client.query('ALTER TABLE clientes_firebird_sync ADD COLUMN IF NOT EXISTS cidade_uf TEXT');
    await client.query('ALTER TABLE clientes_firebird_sync ADD COLUMN IF NOT EXISTS cidade_latitude NUMERIC');
    await client.query('ALTER TABLE clientes_firebird_sync ADD COLUMN IF NOT EXISTS cidade_longitude NUMERIC');
    await client.query('CREATE INDEX IF NOT EXISTS idx_clientes_firebird_razao ON clientes_firebird_sync (razao_social)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_clientes_firebird_status ON clientes_firebird_sync (ativo, bloqueado)');
}

function fetchFirebirdClientes() {
    return new Promise((resolve, reject) => {
        Firebird.attach(firebirdOptions, (err, db) => {
            if (err) return reject(err);
            db.query(firebirdSelect, (queryErr, rows) => {
                db.detach();
                if (queryErr) return reject(queryErr);
                resolve(rows || []);
            });
        });
    });
}

async function sync() {
    console.log('Sincronizando clientes Firebird -> Postgres...');
    const rows = await fetchFirebirdClientes();
    console.log(`${rows.length} clientes lidos do Firebird (somente SELECT).`);

    const client = await pool.connect();
    const batchId = randomUUID();
    try {
        await ensureTable(client);
        await client.query(`
            CREATE TABLE IF NOT EXISTS clientes_sync_batches (
                batch_id UUID PRIMARY KEY,
                status VARCHAR(20) NOT NULL,
                started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                completed_at TIMESTAMPTZ
            );
            CREATE TABLE IF NOT EXISTS clientes_firebird_sync_lotes (LIKE clientes_firebird_sync INCLUDING DEFAULTS);
            ALTER TABLE clientes_firebird_sync_lotes ADD COLUMN IF NOT EXISTS batch_id UUID;
            CREATE UNIQUE INDEX IF NOT EXISTS clientes_firebird_sync_lotes_batch_uidx ON clientes_firebird_sync_lotes (batch_id, empresa, codigo);
            CREATE INDEX IF NOT EXISTS clientes_firebird_sync_lotes_batch_razao_idx ON clientes_firebird_sync_lotes (batch_id, razao_social);
        `);
        await client.query(`INSERT INTO clientes_sync_batches (batch_id, status) VALUES ($1, 'running')`, [batchId]);
        await client.query('BEGIN');
        await client.query('TRUNCATE clientes_firebird_sync');

        const batchSize = 250;
        for (let i = 0; i < rows.length; i += batchSize) {
            const chunk = rows.slice(i, i + batchSize);
            const values = [];
            const placeholders = chunk.map((row, index) => {
                const base = index * 25;
                values.push(
                    row.EMPRESA_CLI,
                    row.CODIGO_CLI,
                    clean(row.RAZAO_SOCIAL_CLI),
                    clean(row.FANTASIA_CLI),
                    clean(row.ATIVO_CLI) === 'S',
                    clean(row.BLOQUEADO_CLI) === 'S',
                    clean(row.CNPJ_CPF_CLI),
                    clean(row.IE_RG_CLI),
                    clean(row.CONTATO_CLI),
                    clean(row.FONE1_CLI),
                    clean(row.FONE2_CLI),
                    clean(row.EMAIL_COMERCIAL_CLI) || clean(row.EMAIL_CLI) || clean(row.EMAIL_NFE_CLI),
                    row.CIDADE_CLI || null,
                    clean(row.CIDADE_NOME),
                    ufMap[row.CIDADE_UF_CODIGO] || null,
                    parseGeo(row.CIDADE_LATITUDE, row.CIDADE_UF_CODIGO, 'lat'),
                    parseGeo(row.CIDADE_LONGITUDE, row.CIDADE_UF_CODIGO, 'lng'),
                    clean(row.CEP_CLI),
                    clean(row.LOGRADOURO_CLI),
                    clean(row.NUMERO_CLI),
                    clean(row.BAIRRO_CLI),
                    toDate(row.DATA_CLI),
                    toDate(row.DATA_INATIVACAO_CLI),
                    clean(row.MOTIVO_BLOQUEIO_CLI),
                    clean(row.OBSERVACAO_IMPORTANTE_CLI)
                );
                return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16},$${base + 17},$${base + 18},$${base + 19},$${base + 20},$${base + 21},$${base + 22},$${base + 23},$${base + 24},$${base + 25})`;
            });

            await client.query(`
                INSERT INTO clientes_firebird_sync (
                    empresa, codigo, razao_social, fantasia, ativo, bloqueado,
                    cnpj_cpf, ie_rg, contato, telefone1, telefone2, email,
                    cidade_codigo, cidade_nome, cidade_uf, cidade_latitude, cidade_longitude, cep, logradouro, numero, bairro,
                    data_cadastro, data_inativacao, motivo_bloqueio, observacao
                ) VALUES ${placeholders.join(',')}
            `, values);
        }

        await client.query('COMMIT');
        await client.query('BEGIN');
        await client.query(`INSERT INTO clientes_firebird_sync_lotes SELECT clientes_firebird_sync.*, $1 FROM clientes_firebird_sync`, [batchId]);
        await client.query(`UPDATE clientes_sync_batches SET status = 'completed', completed_at = NOW() WHERE batch_id = $1`, [batchId]);
        await client.query(`DELETE FROM clientes_sync_batches WHERE batch_id <> $1 AND status = 'completed'`, [batchId]);
        await client.query('COMMIT');
        console.log(`Sync concluido: ${rows.length} clientes gravados no Postgres.`);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

sync().catch(err => {
    console.error('Erro no sync de clientes:', err.message);
    process.exit(1);
});
