const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

const RESPONSAVEIS_COMERCIAIS = new Set([
    'GERUZA MENDES',
    'GUILHERME FENALI',
    'ELISANGELA',
    'MARIA EDUARDA'
]);

const DIGISAC_COMERCIAL_DEPARTMENT_ID = process.env.DIGISAC_COMERCIAL_DEPARTMENT_ID || 'a0dd4917-91dd-4d33-9dcc-567c3f3ddff2';
const DIGISAC_FINANCEIRO_DEPARTMENT_ID = process.env.DIGISAC_FINANCEIRO_DEPARTMENT_ID || '6edd21e5-f88a-4e87-94e1-61a3e97f2466';
const DIGISAC_FINANCEIRO_USER_ID = process.env.DIGISAC_FINANCEIRO_USER_ID || 'c1d3e230-d249-4406-bbb1-2a9bd0e501f3';

const DIGISAC_USER_IDS = {
    'GERUZA MENDES': process.env.DIGISAC_USER_GERUZA_ID || '2f3518c3-7a5d-42c3-805d-7d33735e8303',
    'GUILHERME FENALI': process.env.DIGISAC_USER_GUILHERME_ID || 'c40ebf25-7157-40ee-ac79-1395b8fa58d2',
    'ELISANGELA': process.env.DIGISAC_USER_ELISANGELA_ID || '9cad129c-20bc-4a38-9f14-9d2fa664017c'
};

async function ensureResponsaveisTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS clientes_responsavel_comercial (
            empresa INTEGER NOT NULL,
            codigo INTEGER NOT NULL,
            responsavel_comercial TEXT,
            updated_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (empresa, codigo)
        )
    `);
}

async function ensureDigisacDebugTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS digisac_webhook_debug (
            id SERIAL PRIMARY KEY,
            created_at TIMESTAMP DEFAULT NOW(),
            method TEXT,
            path TEXT,
            query JSONB,
            body JSONB,
            documento TEXT
        )
    `);
}

async function ensureDigisacClienteSessionsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS digisac_cliente_sessions (
            contact_id TEXT PRIMARY KEY,
            documento TEXT,
            responsavel_comercial TEXT,
            cliente JSONB,
            etapa TEXT,
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await pool.query(`ALTER TABLE digisac_cliente_sessions ADD COLUMN IF NOT EXISTS etapa TEXT`);
}

function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

function findCommandInPayload(value) {
    if (!value || typeof value !== 'object') return '';

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findCommandInPayload(item);
            if (found) return found;
        }
        return '';
    }

    const directKeys = ['command', 'comando', 'identifier', 'identificador', 'commandId', 'command_id'];
    for (const key of directKeys) {
        if (typeof value[key] === 'string' && value[key].trim()) {
            return value[key].trim();
        }
    }

    for (const child of Object.values(value)) {
        const found = findCommandInPayload(child);
        if (found) return found;
    }

    return '';
}

function findTextInPayload(value) {
    if (value == null) return '';

    if (typeof value === 'string' || typeof value === 'number') {
        return String(value).trim();
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findTextInPayload(item);
            if (found) return found;
        }
        return '';
    }

    if (typeof value === 'object') {
        const preferredKeys = ['text', 'texto', 'answer', 'resposta', 'message', 'mensagem', 'body', 'content', 'valor', 'value', 'data'];
        for (const key of preferredKeys) {
            const found = findTextInPayload(value[key]);
            if (found) return found;
        }

        for (const child of Object.values(value)) {
            const found = findTextInPayload(child);
            if (found) return found;
        }
    }

    return '';
}

function getDigisacMessageText(req) {
    return String(
        req.body?.opcao ||
        req.body?.option ||
        req.query.opcao ||
        req.query.option ||
        req.body?.data?.message?.text ||
        req.body?.message?.text ||
        req.body?.data?.text ||
        req.body?.text ||
        ''
    ).trim();
}

function findDocumentInPayload(value) {
    if (value == null) return '';

    if (typeof value === 'string' || typeof value === 'number') {
        const digits = onlyDigits(value);
        if (digits.length === 11 || digits.length === 14) return digits;
        return '';
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findDocumentInPayload(item);
            if (found) return found;
        }
        return '';
    }

    if (typeof value === 'object') {
        const preferredKeys = ['documento', 'cnpj', 'cpf', 'cnpjCpf', 'answer', 'resposta', 'text', 'texto', 'message', 'mensagem', 'body', 'content', 'valor', 'value'];
        for (const key of preferredKeys) {
            const found = findDocumentInPayload(value[key]);
            if (found) return found;
        }

        for (const child of Object.values(value)) {
            const found = findDocumentInPayload(child);
            if (found) return found;
        }
    }

    return '';
}

function getRawDocumentoInput(req) {
    return String(
        req.body?.documento ||
        req.body?.cnpjCpf ||
        req.body?.cnpj ||
        req.query.documento ||
        req.query.cnpjCpf ||
        req.query.cnpj ||
        ''
    ).trim();
}

function isDocumentoFormatValid(value) {
    const digits = onlyDigits(value);
    return digits.length === 11 || digits.length === 14;
}

function hasValidDigisacToken(req) {
    const expected = process.env.DIGISAC_WEBHOOK_TOKEN;
    if (!expected) return true;
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const headerToken = String(req.headers['x-digisac-token'] || '').trim();
    return bearer === expected || headerToken === expected;
}

async function saveDigisacDebug(req, documento) {
    try {
        await ensureDigisacDebugTable();
        await pool.query(`
            INSERT INTO digisac_webhook_debug (method, path, query, body, documento)
            VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
        `, [
            req.method,
            req.originalUrl || req.url,
            JSON.stringify(req.query || {}),
            JSON.stringify(req.body || {}),
            documento || null
        ]);
    } catch (err) {
        console.warn('Erro ao salvar debug Digisac:', err.message);
    }
}

async function getRecentDigisacWebhookDocument() {
    try {
        await ensureDigisacDebugTable();
        const result = await pool.query(`
            SELECT documento
            FROM digisac_webhook_debug
            WHERE documento IS NOT NULL
              AND created_at >= NOW() - INTERVAL '2 minutes'
            ORDER BY id DESC
            LIMIT 1
        `);
        return result.rows[0]?.documento || '';
    } catch (err) {
        console.warn('Erro ao consultar último documento Digisac:', err.message);
        return '';
    }
}

async function getRecentDigisacWebhookDocumentByContact(contactId) {
    if (!contactId) return '';

    try {
        await ensureDigisacDebugTable();
        const result = await pool.query(`
            SELECT documento
            FROM digisac_webhook_debug
            WHERE documento IS NOT NULL
              AND length(regexp_replace(documento, '\\D', '', 'g')) IN (11, 14)
              AND (
                  body #>> '{data,contactId}' = $1
                  OR body #>> '{data,message,contactId}' = $1
                  OR body #>> '{data,message,fromId}' = $1
                  OR body #>> '{contactId}' = $1
                  OR body #>> '{contact_id}' = $1
              )
            ORDER BY id DESC
            LIMIT 1
        `, [contactId]);
        return result.rows[0]?.documento || '';
    } catch (err) {
        console.warn('Erro ao consultar ultimo documento Digisac por contato:', err.message);
        return '';
    }
}

async function saveDigisacClienteSession(contactId, documento, row, etapa = 'menu_opcoes') {
    if (!contactId || !row) return null;

    await ensureDigisacClienteSessionsTable();
    await pool.query(`
        INSERT INTO digisac_cliente_sessions (contact_id, documento, responsavel_comercial, cliente, etapa, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
        ON CONFLICT (contact_id)
        DO UPDATE SET
            documento = EXCLUDED.documento,
            responsavel_comercial = EXCLUDED.responsavel_comercial,
            cliente = EXCLUDED.cliente,
            etapa = EXCLUDED.etapa,
            updated_at = NOW()
    `, [
        contactId,
        documento,
        row.responsavel_comercial || null,
        JSON.stringify(row),
        etapa
    ]);

    return { success: true };
}

async function getDigisacClienteSession(contactId) {
    if (!contactId) return null;

    await ensureDigisacClienteSessionsTable();
    const result = await pool.query(`
        SELECT contact_id, documento, responsavel_comercial, cliente, etapa, updated_at
        FROM digisac_cliente_sessions
        WHERE contact_id = $1
          AND updated_at >= NOW() - INTERVAL '2 hours'
        LIMIT 1
    `, [contactId]);

    return result.rows[0] || null;
}

async function clearDigisacClienteSession(contactId) {
    if (!contactId) return null;

    await ensureDigisacClienteSessionsTable();
    await pool.query('DELETE FROM digisac_cliente_sessions WHERE contact_id = $1', [contactId]);
    return { success: true };
}

function getDigisacConfig() {
    return {
        baseUrl: String(process.env.DIGISAC_API_BASE_URL || 'https://fundicaoerus.digisac.co/api/v1').replace(/\/+$/, ''),
        token: process.env.DIGISAC_API_TOKEN
    };
}

async function requestDigisacJson(path, options = {}) {
    const { baseUrl, token } = getDigisacConfig();
    if (!token || typeof fetch !== 'function') return null;

    const response = await fetch(`${baseUrl}${path}`, {
        method: options.method || 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) return null;
    return response.json();
}

async function fetchDigisacJson(path) {
    return requestDigisacJson(path);
}

function findContactIdInPayload(value) {
    if (!value || typeof value !== 'object') return '';

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findContactIdInPayload(item);
            if (found) return found;
        }
        return '';
    }

    const direct = value.contactId || value.contact_id || value.idContato || value.contatoId;
    if (direct && /^[0-9a-f-]{20,}$/i.test(String(direct))) return String(direct);

    for (const child of Object.values(value)) {
        const found = findContactIdInPayload(child);
        if (found) return found;
    }

    return '';
}

async function transferDigisacTicketTo(contactId, departmentId, userId, comments) {
    if (!contactId || !departmentId) return null;
    const body = {
        departmentId,
        comments
    };

    if (userId) {
        body.userId = userId;
    }

    const result = await requestDigisacJson(`/contacts/${encodeURIComponent(contactId)}/ticket/transfer`, {
        method: 'POST',
        body
    });

    return {
        success: !!result,
        departmentId: body.departmentId,
        userId: body.userId || null
    };
}

async function transferDigisacTicket(contactId, responsavelComercial, clienteNome, clienteCnpj) {
    const responsavel = String(responsavelComercial || '').trim().toUpperCase();
    const nome = String(clienteNome || '').trim() || 'cliente';
    const cnpj = String(clienteCnpj || '').trim() || 'não informado';
    return transferDigisacTicketTo(
        contactId,
        DIGISAC_COMERCIAL_DEPARTMENT_ID,
        DIGISAC_USER_IDS[responsavel] || null,
        `Cliente: ${nome} | CNPJ: ${cnpj} | Destino: Comercial | Responsável: ${responsavel || 'não definido'}`
    );
}

async function sendDigisacMessage(contactId, text) {
    if (!contactId || !text) return null;

    const result = await requestDigisacJson('/messages', {
        method: 'POST',
        body: {
            text,
            type: 'chat',
            contactId,
            origin: 'bot'
        }
    });

    return { success: !!result };
}

function findFirstObjectWithCnpjField(value) {
    if (!value || typeof value !== 'object') return null;

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findFirstObjectWithCnpjField(item);
            if (found) return found;
        }
        return null;
    }

    const directKeys = ['cnpj', 'CNPJ', 'value', 'valor'];
    const name = String(value.name || value.nome || value.key || value.chave || value.label || '').toLowerCase();
    if (name === 'cnpj') {
        for (const key of directKeys) {
            const digits = onlyDigits(value[key]);
            if (digits.length >= 11) return digits;
        }
    }

    for (const [key, child] of Object.entries(value)) {
        if (String(key).toLowerCase() === 'cnpj') {
            const digits = onlyDigits(child);
            if (digits.length >= 11) return digits;
        }
        const found = findFirstObjectWithCnpjField(child);
        if (found) return found;
    }

    return null;
}

function normalizeDigisacContacts(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.contacts)) return payload.contacts;
    return [payload];
}

async function getCnpjFromDigisacContact(numeroContato) {
    const numero = onlyDigits(numeroContato);
    if (!numero) return '';

    const encoded = encodeURIComponent(numero);
    const candidates = [
        `/contacts?search=${encoded}`,
        `/contacts?number=${encoded}`,
        `/contacts?phone=${encoded}`,
        `/contacts?where=${encodeURIComponent(JSON.stringify({ number: numero }))}`
    ];

    for (const path of candidates) {
        const payload = await fetchDigisacJson(path);
        const contacts = normalizeDigisacContacts(payload);
        for (const contact of contacts) {
            const cnpj = findFirstObjectWithCnpjField(contact);
            if (cnpj) return cnpj;
        }
    }

    return '';
}

async function getCnpjFromDigisacContactId(contactId) {
    if (!contactId) return '';

    const payload = await fetchDigisacJson(`/contacts/${encodeURIComponent(contactId)}`);
    return findFirstObjectWithCnpjField(payload) || '';
}

async function findClienteByDocumento(documento) {
    if (!documento) return null;

    const result = await pool.query(`
        SELECT
            c.empresa,
            c.codigo,
            c.razao_social,
            c.fantasia,
            c.cnpj_cpf,
            c.contato,
            c.telefone1,
            c.telefone2,
            c.email,
            c.ativo,
            c.bloqueado,
            rc.responsavel_comercial
        FROM clientes_firebird_sync c
        LEFT JOIN clientes_responsavel_comercial rc
            ON rc.empresa = c.empresa
            AND rc.codigo = c.codigo
        WHERE regexp_replace(COALESCE(c.cnpj_cpf, ''), '\\D', '', 'g') = $1
        ORDER BY c.ativo DESC, c.bloqueado ASC, c.razao_social NULLS LAST
        LIMIT 1
    `, [documento]);

    return result.rows[0] || null;
}

function buildDigisacMessage(row) {
    if (!row) {
        return '❌ Não encontramos cadastro para o CNPJ/CPF informado. Nossa equipe comercial já foi acionada e em breve dará continuidade ao atendimento.';
    }
    return '✅ Recebemos seu documento, e estamos consultando em nossa base de dados.\n\nEnquanto isso, escolha uma opção:\n\n1️⃣ - Falar com o comercial\n2️⃣ - 2ª via de boleto\n3️⃣ - 2ª via de nota fiscal';
}

function getSessionClienteValue(session, key) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    return session?.cliente?.[key] || session?.cliente?.[snakeKey] || '';
}

function buildDigisacSavedCnpjConfirmationMessage(row) {
    const nome = row?.razao_social || row?.fantasia || 'cliente';
    const documento = row?.cnpj_cpf || row?.cnpjCpf || '';
    return `Identificamos seu cadastro conforme seu último contato conosco.\n\nCNPJ/CPF: ${documento}\nCliente: ${nome}\n\nDeseja continuar com este cadastro?\n\n1 - Sim\n2 - Não`;
}

function buildDigisacContinueWithCadastroMessage() {
    return 'Ok, vamos continuar com este cadastro.\n\nEscolha uma opção:\n\n1️⃣ - Falar com o comercial\n2️⃣ - 2ª via de boleto\n3️⃣ - 2ª via de nota fiscal';
}

function buildDigisacWelcomeMessage() {
    return 'Olá! Seja bem-vindo à Fundição Erus. 🇧🇷\n\nVocê entrou em contato com o Setor Comercial.\n\nComo podemos ajudá-lo?\n\n1️⃣ - Já sou cliente\n\n2️⃣ - Não sou cliente\n\nResponda apenas com o número da opção desejada.';
}

router.get('/list/all', async (req, res) => {
    try {
        await ensureResponsaveisTable();
        await pool.query(`
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
        await pool.query('ALTER TABLE clientes_firebird_sync ADD COLUMN IF NOT EXISTS cidade_nome TEXT');
        await pool.query('ALTER TABLE clientes_firebird_sync ADD COLUMN IF NOT EXISTS cidade_uf TEXT');
        await pool.query('ALTER TABLE clientes_firebird_sync ADD COLUMN IF NOT EXISTS cidade_latitude NUMERIC');
        await pool.query('ALTER TABLE clientes_firebird_sync ADD COLUMN IF NOT EXISTS cidade_longitude NUMERIC');

        const result = await pool.query(`
        SELECT
            c.empresa, c.codigo, c.razao_social, c.fantasia, c.ativo, c.bloqueado,
            c.cnpj_cpf, c.ie_rg, c.contato, c.telefone1, c.telefone2, c.email,
            c.cidade_codigo, c.cidade_nome, c.cidade_uf, c.cidade_latitude, c.cidade_longitude, c.cep, c.logradouro, c.numero, c.bairro,
            c.data_cadastro, c.data_inativacao, c.motivo_bloqueio, c.observacao, c.synced_at,
            rc.responsavel_comercial
        FROM clientes_firebird_sync c
        LEFT JOIN clientes_responsavel_comercial rc
            ON rc.empresa = c.empresa
            AND rc.codigo = c.codigo
        ORDER BY c.razao_social NULLS LAST, c.codigo
        `);

        const data = result.rows.map(row => ({
            empresa: row.empresa,
            codigo: row.codigo,
            razaoSocial: row.razao_social,
            fantasia: row.fantasia,
            ativo: row.ativo,
            bloqueado: row.bloqueado,
            cnpjCpf: row.cnpj_cpf,
            ieRg: row.ie_rg,
            contato: row.contato,
            telefone1: row.telefone1,
            telefone2: row.telefone2,
            email: row.email,
            cidadeCodigo: row.cidade_codigo,
            cidadeNome: row.cidade_nome,
            cidadeUf: row.cidade_uf,
            cidadeLatitude: row.cidade_latitude === null ? null : Number(row.cidade_latitude),
            cidadeLongitude: row.cidade_longitude === null ? null : Number(row.cidade_longitude),
            cep: row.cep,
            logradouro: row.logradouro,
            numero: row.numero,
            bairro: row.bairro,
            dataCadastro: row.data_cadastro,
            dataInativacao: row.data_inativacao,
            motivoBloqueio: row.motivo_bloqueio,
            observacao: row.observacao,
            responsavelComercial: row.responsavel_comercial,
            syncedAt: row.synced_at
        }));

        res.json({ success: true, data, total: data.length });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: 'Erro ao consultar clientes sincronizados no Postgres',
            details: err.message
        });
    }
});

router.all('/digisac/consultor', async (req, res) => {
    try {
        if (!hasValidDigisacToken(req)) {
            return res.status(401).json({ success: false, error: 'Token Digisac inválido.' });
        }

        await ensureResponsaveisTable();
        await ensureDigisacClienteSessionsTable();
        const contactId = req.body?.contactId || req.body?.contact_id || req.query.contactId || req.query.contact_id || findContactIdInPayload(req.body);
        const command = String(req.body?.command || req.body?.comando || req.query.command || req.query.comando || findCommandInPayload(req.body) || '').trim();
        const commandNormalized = command.toLowerCase();

        if (['consulta_cnpj_contato', 'consulta_contato', 'verifica_cnpj_contato'].includes(commandNormalized)) {
            const optionText = getDigisacMessageText(req) || findTextInPayload(req.body);
            const opcao = onlyDigits(optionText).slice(0, 1);
            const session = await getDigisacClienteSession(contactId);

            if (session?.etapa === 'confirmacao_cnpj_salvo') {
                await saveDigisacDebug(req, opcao || session.documento || null);

                if (!opcao) {
                    const notification = await sendDigisacMessage(contactId, buildDigisacSavedCnpjConfirmationMessage(session.cliente));

                    return res.json({
                        success: true,
                        found: true,
                        encontrado: 'sim',
                        action: 'confirmar_cnpj_salvo',
                        pendingConfirmation: true,
                        responsavel_comercial: session.responsavel_comercial,
                        responsavelComercial: session.responsavel_comercial,
                        notification
                    });
                }

                if (opcao === '1') {
                    await saveDigisacClienteSession(contactId, session.documento, {
                        ...session.cliente,
                        responsavel_comercial: session.responsavel_comercial
                    }, 'menu_opcoes');
                    const notification = await sendDigisacMessage(contactId, buildDigisacContinueWithCadastroMessage());

                    return res.json({
                        success: true,
                        found: true,
                        encontrado: 'sim',
                        action: 'menu_opcoes_cliente',
                        pendingSelection: true,
                        responsavel_comercial: session.responsavel_comercial,
                        responsavelComercial: session.responsavel_comercial,
                        notification
                    });
                }

                if (opcao === '2') {
                    await clearDigisacClienteSession(contactId);
                    const notification = await sendDigisacMessage(contactId, buildDigisacWelcomeMessage());

                    return res.json({
                        success: true,
                        found: false,
                        encontrado: 'nao',
                        action: 'iniciar_fluxo_comercial',
                        startDefaultFlow: true,
                        notification
                    });
                }

                const notification = await sendDigisacMessage(contactId, 'Opcao invalida. Responda 1 para continuar com este cadastro ou 2 para informar outro cadastro.');
                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    action: 'confirmar_cnpj_salvo',
                    pendingConfirmation: true,
                    invalidOption: true,
                    message: 'Opcao invalida.',
                    notification
                });
            }

            if (session?.etapa === 'menu_opcoes' && opcao) {
                await saveDigisacDebug(req, opcao || session.documento || null);

                if (opcao === '2') {
                    const notification = await sendDigisacMessage(contactId, 'Cadastro identificado!\nSeu atendimento sera redirecionado para o setor financeiro.');
                    const clienteNome = getSessionClienteValue(session, 'razaoSocial') || getSessionClienteValue(session, 'fantasia') || 'cliente';
                    const clienteCnpj = session.documento || getSessionClienteValue(session, 'cnpjCpf') || 'nao informado';
                    const transfer = await transferDigisacTicketTo(
                        contactId,
                        DIGISAC_FINANCEIRO_DEPARTMENT_ID,
                        DIGISAC_FINANCEIRO_USER_ID,
                        `Cliente: ${clienteNome} | CNPJ: ${clienteCnpj} | Destino: Financeiro | Motivo: 2a via de boleto`
                    );

                    return res.json({
                        success: true,
                        found: true,
                        encontrado: 'sim',
                        action: 'segunda_via_boleto',
                        responsavel_comercial: session.responsavel_comercial,
                        responsavelComercial: session.responsavel_comercial,
                        notification,
                        transfer
                    });
                }

                if (opcao === '1' || opcao === '3') {
                    const notification = await sendDigisacMessage(contactId, 'Cadastro identificado!\nSeu atendimento sera direcionado ao responsavel comercial.\nEnquanto isso, conte-nos qual assunto voce deseja tratar.');
                    const clienteNome = getSessionClienteValue(session, 'razaoSocial') || getSessionClienteValue(session, 'fantasia') || 'cliente';
                    const clienteCnpj = session.documento || getSessionClienteValue(session, 'cnpjCpf') || 'nao informado';
                    const transfer = await transferDigisacTicket(contactId, session.responsavel_comercial, clienteNome, clienteCnpj);

                    return res.json({
                        success: true,
                        found: true,
                        encontrado: 'sim',
                        action: opcao === '1' ? 'falar_com_comercial' : 'segunda_via_nota_fiscal',
                        responsavel_comercial: session.responsavel_comercial,
                        responsavelComercial: session.responsavel_comercial,
                        notification,
                        transfer
                    });
                }

                const notification = await sendDigisacMessage(contactId, 'Opcao invalida. Responda 1 para falar com o comercial, 2 para 2 via de boleto ou 3 para 2 via de nota fiscal.');
                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    invalidOption: true,
                    message: 'Opcao invalida.',
                    notification
                });
            }

            let documentoContato = onlyDigits(req.body?.documento || req.body?.cnpjCpf || req.body?.cnpj || req.query.documento || req.query.cnpjCpf || req.query.cnpj);
            if (!isDocumentoFormatValid(documentoContato)) {
                documentoContato = '';
            }
            if (!documentoContato) {
                documentoContato = findFirstObjectWithCnpjField(req.body) || '';
            }
            if (!documentoContato) {
                documentoContato = await getCnpjFromDigisacContactId(contactId);
            }
            if (!documentoContato) {
                documentoContato = await getCnpjFromDigisacContact(req.body?.numeroContato || req.body?.numero_contato || req.query.numeroContato || req.query.numero_contato);
            }
            if (!documentoContato) {
                documentoContato = await getRecentDigisacWebhookDocumentByContact(contactId);
            }

            await saveDigisacDebug(req, documentoContato || null);

            if (!documentoContato) {
                const notification = contactId ? await sendDigisacMessage(contactId, buildDigisacWelcomeMessage()) : null;
                if (contactId) {
                    await clearDigisacClienteSession(contactId);
                }
                return res.json({
                    success: true,
                    found: false,
                    encontrado: 'nao',
                    action: 'iniciar_fluxo_comercial',
                    startDefaultFlow: true,
                    notification,
                    message: buildDigisacWelcomeMessage(),
                    cliente: null
                });
            }

            const rowContato = await findClienteByDocumento(documentoContato);
            if (!rowContato) {
                const notification = contactId ? await sendDigisacMessage(contactId, buildDigisacWelcomeMessage()) : null;
                if (contactId) {
                    await clearDigisacClienteSession(contactId);
                }
                return res.json({
                    success: true,
                    found: false,
                    encontrado: 'nao',
                    action: 'iniciar_fluxo_comercial',
                    startDefaultFlow: true,
                    documento: documentoContato,
                    notification,
                    cliente: null
                });
            }

            let notification = null;
            if (contactId) {
                await saveDigisacClienteSession(contactId, documentoContato, rowContato, 'confirmacao_cnpj_salvo');
                notification = await sendDigisacMessage(contactId, buildDigisacSavedCnpjConfirmationMessage(rowContato));
            }

            return res.json({
                success: true,
                found: true,
                encontrado: 'sim',
                action: 'confirmar_cnpj_salvo',
                pendingConfirmation: true,
                responsavel_comercial: rowContato.responsavel_comercial || null,
                responsavelComercial: rowContato.responsavel_comercial || null,
                notification,
                cliente: {
                    empresa: rowContato.empresa,
                    codigo: rowContato.codigo,
                    razaoSocial: rowContato.razao_social,
                    fantasia: rowContato.fantasia,
                    cnpjCpf: rowContato.cnpj_cpf,
                    responsavelComercial: rowContato.responsavel_comercial
                }
            });
        }

        if (commandNormalized === 'opcao_cliente') {
            const optionText = getDigisacMessageText(req) || findTextInPayload(req.body);
            const opcao = onlyDigits(optionText).slice(0, 1);
            let session = await getDigisacClienteSession(contactId);
            let documentoOpcao = onlyDigits(req.body?.documento || req.body?.cnpjCpf || req.body?.cnpj || req.query.documento || req.query.cnpjCpf || req.query.cnpj);
            if (!documentoOpcao) {
                documentoOpcao = findDocumentInPayload(req.body);
            }
            if (!documentoOpcao && session?.etapa !== 'confirmacao_cnpj_salvo') {
                documentoOpcao = await getCnpjFromDigisacContactId(contactId);
            }
            if (documentoOpcao && session?.etapa !== 'confirmacao_cnpj_salvo') {
                const rowOpcao = await findClienteByDocumento(documentoOpcao);
                if (rowOpcao && contactId) {
                    await saveDigisacClienteSession(contactId, documentoOpcao, rowOpcao);
                    session = await getDigisacClienteSession(contactId);
                } else if (contactId) {
                    await clearDigisacClienteSession(contactId);
                    session = null;
                }
            }
            await saveDigisacDebug(req, documentoOpcao || opcao || null);

            if (session?.etapa === 'confirmacao_cnpj_salvo') {
                if (opcao === '1') {
                    await saveDigisacClienteSession(contactId, session.documento, {
                        ...session.cliente,
                        responsavel_comercial: session.responsavel_comercial
                    }, 'menu_opcoes');
                    const notification = await sendDigisacMessage(contactId, buildDigisacMessage(session.cliente));

                    return res.json({
                        success: true,
                        found: true,
                        encontrado: 'sim',
                        action: 'menu_opcoes_cliente',
                        pendingSelection: true,
                        responsavel_comercial: session.responsavel_comercial,
                        responsavelComercial: session.responsavel_comercial,
                        notification
                    });
                }

                if (opcao === '2') {
                    await clearDigisacClienteSession(contactId);
                    const notification = await sendDigisacMessage(contactId, buildDigisacWelcomeMessage());
                    return res.json({
                        success: true,
                        found: false,
                        encontrado: 'nao',
                        action: 'iniciar_fluxo_comercial',
                        startDefaultFlow: true,
                        notification
                    });
                }

                const notification = await sendDigisacMessage(contactId, 'Opção inválida. Responda 1 para continuar com este cadastro ou 2 para informar outro cadastro.');
                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    action: 'confirmar_cnpj_salvo',
                    pendingConfirmation: true,
                    invalidOption: true,
                    message: 'Opção inválida.',
                    notification
                });
            }

            if (!contactId || !session) {
                let notification = null;
                let transfer = null;
                if (contactId) {
                    notification = await sendDigisacMessage(contactId, 'Não encontramos cadastro para o CNPJ/CPF informado. Seu atendimento será direcionado ao departamento Comercial.');
                    transfer = await transferDigisacTicketTo(
                        contactId,
                        DIGISAC_COMERCIAL_DEPARTMENT_ID,
                        null,
                        'Nenhum cadastro encontrado. Transferido automaticamente para o departamento Comercial.'
                    );
                }
                return res.json({ success: true, found: false, encontrado: 'nao', message: 'Cadastro nao encontrado para este contato.', notification, transfer });
            }

            if (opcao === '2') {
                const notification = await sendDigisacMessage(contactId, '✅ Cadastro identificado!\nSeu atendimento será redirecionado para o setor financeiro.');
                const clienteNome = getSessionClienteValue(session, 'razaoSocial') || getSessionClienteValue(session, 'fantasia') || 'cliente';
                const clienteCnpj = session.documento || getSessionClienteValue(session, 'cnpjCpf') || 'nao informado';
                const transfer = await transferDigisacTicketTo(
                    contactId,
                    DIGISAC_FINANCEIRO_DEPARTMENT_ID,
                    DIGISAC_FINANCEIRO_USER_ID,
                    `Cliente: ${clienteNome} | CNPJ: ${clienteCnpj} | Destino: Financeiro | Motivo: 2ª via de boleto`
                );

                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    action: 'segunda_via_boleto',
                    responsavel_comercial: session.responsavel_comercial,
                    responsavelComercial: session.responsavel_comercial,
                    notification,
                    transfer
                });
            }

            if (opcao === '1' || opcao === '3') {
                const notification = await sendDigisacMessage(contactId, '✅ Cadastro identificado!\nSeu atendimento será direcionado ao responsável comercial.\nEnquanto isso, conte-nos qual assunto você deseja tratar.');
                const clienteNome = getSessionClienteValue(session, 'razaoSocial') || getSessionClienteValue(session, 'fantasia') || 'cliente';
                const clienteCnpj = session.documento || getSessionClienteValue(session, 'cnpjCpf') || 'nao informado';
                const transfer = await transferDigisacTicket(contactId, session.responsavel_comercial, clienteNome, clienteCnpj);

                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    action: opcao === '1' ? 'falar_com_comercial' : 'segunda_via_nota_fiscal',
                    responsavel_comercial: session.responsavel_comercial,
                    responsavelComercial: session.responsavel_comercial,
                    notification,
                    transfer
                });
            }

            const notification = await sendDigisacMessage(contactId, 'Opcao invalida. Responda 1 para falar com o comercial, 2 para 2 via de boleto ou 3 para 2 via de nota fiscal.');
            return res.json({ success: true, found: true, encontrado: 'sim', invalidOption: true, message: 'Opcao invalida.', notification });
        }

        const rawDocumentoInput = getRawDocumentoInput(req);
        let documento = onlyDigits(rawDocumentoInput);
        const documentProvided = String(rawDocumentoInput || '').trim().length > 0;
        const documentoValido = isDocumentoFormatValid(rawDocumentoInput);

        if (documentProvided && !documentoValido) {
            await saveDigisacDebug(req, documento || null);
            if (contactId) {
                await clearDigisacClienteSession(contactId);
                await sendDigisacMessage(contactId, 'Por favor, digite o CNPJ/CPF apenas com números, sem pontos, barras ou traços. Ex: 12345678000199');
            }
            return res.json({
                success: true,
                found: false,
                encontrado: 'nao',
                formatoInvalido: true,
                message: 'Por favor, digite o CNPJ/CPF apenas com números, sem pontos, barras ou traços. Ex: 12345678000199',
                cliente: null
            });
        }

        if (!documento) {
            documento = findDocumentInPayload(req.body);
        }
        if (!documento) {
            documento = await getCnpjFromDigisacContact(req.body?.numeroContato || req.body?.numero_contato || req.query.numeroContato || req.query.numero_contato);
        }
        if (!commandNormalized && !documento && contactId) {
            let documentoContato = findFirstObjectWithCnpjField(req.body) || '';
            if (!documentoContato) {
                documentoContato = await getCnpjFromDigisacContactId(contactId);
            }
            if (documentoContato) {
                const rowContato = await findClienteByDocumento(documentoContato);
                await saveDigisacDebug(req, documentoContato);

                if (rowContato) {
                    await saveDigisacClienteSession(contactId, documentoContato, rowContato, 'confirmacao_cnpj_salvo');
                    const notification = await sendDigisacMessage(contactId, buildDigisacSavedCnpjConfirmationMessage(rowContato));
                    return res.json({
                        success: true,
                        found: true,
                        encontrado: 'sim',
                        action: 'confirmar_cnpj_salvo',
                        pendingConfirmation: true,
                        responsavel_comercial: rowContato.responsavel_comercial || null,
                        responsavelComercial: rowContato.responsavel_comercial || null,
                        notification,
                        cliente: {
                            empresa: rowContato.empresa,
                            codigo: rowContato.codigo,
                            razaoSocial: rowContato.razao_social,
                            fantasia: rowContato.fantasia,
                            cnpjCpf: rowContato.cnpj_cpf,
                            responsavelComercial: rowContato.responsavel_comercial
                        }
                    });
                }
            }
        }
        if (!commandNormalized && !documento) {
            await saveDigisacDebug(req, null);
            return res.json({ success: true, ignored: true, message: 'Evento Digisac ignorado: sem comando e sem documento.' });
        }
        await saveDigisacDebug(req, documento);
        if (!documento) {
            if (contactId) {
                await clearDigisacClienteSession(contactId);
                await sendDigisacMessage(contactId, '❌ Não encontramos CNPJ/CPF válido para este contato. Seu atendimento será transferido para o departamento Comercial.');
                await transferDigisacTicketTo(
                    contactId,
                    DIGISAC_COMERCIAL_DEPARTMENT_ID,
                    null,
                    'Nenhum cadastro ou CNPJ encontrado. Transferido automaticamente para o departamento Comercial.'
                );
            }
            return res.json({
                success: true,
                found: false,
                encontrado: 'nao',
                message: 'Não consegui localizar o CNPJ/CPF salvo no contato. Por favor, aguarde nosso time comercial para continuar o atendimento.',
                cliente: null
            });
        }

        const result = await pool.query(`
            SELECT
                c.empresa,
                c.codigo,
                c.razao_social,
                c.fantasia,
                c.cnpj_cpf,
                c.contato,
                c.telefone1,
                c.telefone2,
                c.email,
                c.ativo,
                c.bloqueado,
                rc.responsavel_comercial
            FROM clientes_firebird_sync c
            LEFT JOIN clientes_responsavel_comercial rc
                ON rc.empresa = c.empresa
                AND rc.codigo = c.codigo
            WHERE regexp_replace(COALESCE(c.cnpj_cpf, ''), '\\D', '', 'g') = $1
            ORDER BY c.ativo DESC, c.bloqueado ASC, c.razao_social NULLS LAST
            LIMIT 1
        `, [documento]);

        const row = result.rows[0] || null;
        if (row && contactId) {
            await saveDigisacClienteSession(contactId, documento, row);
            await sendDigisacMessage(contactId, buildDigisacMessage(row));
        } else if (contactId) {
            await clearDigisacClienteSession(contactId);
        }

        res.json({
            success: true,
            found: !!row,
            encontrado: row ? 'sim' : 'nao',
            responsavel_comercial: row?.responsavel_comercial || null,
            responsavelComercial: row?.responsavel_comercial || null,
            pendingSelection: !!row,
            cliente: row ? {
                empresa: row.empresa,
                codigo: row.codigo,
                razaoSocial: row.razao_social,
                fantasia: row.fantasia,
                cnpjCpf: row.cnpj_cpf,
                contato: row.contato,
                telefone: row.telefone1 || row.telefone2 || null,
                email: row.email,
                ativo: row.ativo,
                bloqueado: row.bloqueado,
                responsavelComercial: row.responsavel_comercial
            } : null
        });
    } catch (err) {
        res.status(500).json({ success: false, found: false, encontrado: 'nao', error: 'Erro ao consultar cliente para Digisac', details: err.message });
    }
});

router.get('/digisac/debug-last', async (req, res) => {
    try {
        await ensureDigisacDebugTable();
        const result = await pool.query(`
            SELECT id, created_at, method, path, query, body, documento
            FROM digisac_webhook_debug
            ORDER BY id DESC
            LIMIT 5
        `);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao consultar debug Digisac', details: err.message });
    }
});

router.post('/responsavel-comercial', async (req, res) => {
    try {
        await ensureResponsaveisTable();
        const empresa = Number(req.body.empresa);
        const codigo = Number(req.body.codigo);
        const responsavel = String(req.body.responsavelComercial || '').trim().toUpperCase();

        if (!Number.isInteger(empresa) || !Number.isInteger(codigo)) {
            return res.status(400).json({ success: false, error: 'Cliente inválido.' });
        }
        if (responsavel && !RESPONSAVEIS_COMERCIAIS.has(responsavel)) {
            return res.status(400).json({ success: false, error: 'Responsável comercial inválido.' });
        }

        await pool.query(`
            INSERT INTO clientes_responsavel_comercial (empresa, codigo, responsavel_comercial, updated_at)
            VALUES ($1, $2, NULLIF($3, ''), NOW())
            ON CONFLICT (empresa, codigo)
            DO UPDATE SET responsavel_comercial = EXCLUDED.responsavel_comercial, updated_at = NOW()
        `, [empresa, codigo, responsavel]);

        res.json({ success: true, responsavelComercial: responsavel || null });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao salvar responsável comercial', details: err.message });
    }
});

module.exports = router;
