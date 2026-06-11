const pool = require('../../lib/db');
const { Firebird, options: firebirdOptions } = require('../../lib/firebird-helper');

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

const firebirdSelect = `
    SELECT
        EMPRESA_CLI,
        CODIGO_CLI,
        RAZAO_SOCIAL_CLI,
        FANTASIA_CLI,
        ATIVO_CLI,
        BLOQUEADO_CLI,
        CNPJ_CPF_CLI,
        IE_RG_CLI,
        CONTATO_CLI,
        FONE1_CLI,
        FONE2_CLI,
        EMAIL_CLI,
        EMAIL_COMERCIAL_CLI,
        EMAIL_NFE_CLI,
        CIDADE_CLI,
        CEP_CLI,
        LOGRADOURO_CLI,
        NUMERO_CLI,
        BAIRRO_CLI,
        DATA_CLI,
        DATA_INATIVACAO_CLI,
        MOTIVO_BLOQUEIO_CLI,
        OBSERVACAO_IMPORTANTE_CLI
    FROM CLIENTE
    ORDER BY RAZAO_SOCIAL_CLI
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
    try {
        await ensureTable(client);
        await client.query('BEGIN');
        await client.query('TRUNCATE clientes_firebird_sync');

        const batchSize = 250;
        for (let i = 0; i < rows.length; i += batchSize) {
            const chunk = rows.slice(i, i + batchSize);
            const values = [];
            const placeholders = chunk.map((row, index) => {
                const base = index * 21;
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
                    clean(row.CEP_CLI),
                    clean(row.LOGRADOURO_CLI),
                    clean(row.NUMERO_CLI),
                    clean(row.BAIRRO_CLI),
                    toDate(row.DATA_CLI),
                    toDate(row.DATA_INATIVACAO_CLI),
                    clean(row.MOTIVO_BLOQUEIO_CLI),
                    clean(row.OBSERVACAO_IMPORTANTE_CLI)
                );
                return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16},$${base + 17},$${base + 18},$${base + 19},$${base + 20},$${base + 21})`;
            });

            await client.query(`
                INSERT INTO clientes_firebird_sync (
                    empresa, codigo, razao_social, fantasia, ativo, bloqueado,
                    cnpj_cpf, ie_rg, contato, telefone1, telefone2, email,
                    cidade_codigo, cep, logradouro, numero, bairro,
                    data_cadastro, data_inativacao, motivo_bloqueio, observacao
                ) VALUES ${placeholders.join(',')}
            `, values);
        }

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
