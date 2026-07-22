const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const crypto = require('crypto');

const RESPONSAVEIS_COMERCIAIS = new Set([
    'GERUZA MENDES',
    'GUILHERME FENALI',
    'ELISANGELA',
    'MARIA EDUARDA'
]);

const DIGISAC_COMERCIAL_DEPARTMENT_ID = process.env.DIGISAC_COMERCIAL_DEPARTMENT_ID || 'a0dd4917-91dd-4d33-9dcc-567c3f3ddff2';
const DIGISAC_FINANCEIRO_DEPARTMENT_ID = process.env.DIGISAC_FINANCEIRO_DEPARTMENT_ID || '6edd21e5-f88a-4e87-94e1-61a3e97f2466';
const DIGISAC_FINANCEIRO_USER_ID = process.env.DIGISAC_FINANCEIRO_USER_ID || 'c1d3e230-d249-4406-bbb1-2a9bd0e501f3';
const DIGISAC_EM_ATENDIMENTO_TAG_ID = process.env.DIGISAC_EM_ATENDIMENTO_TAG_ID || '';
const DIGISAC_EM_ATENDIMENTO_TAG_NAME = process.env.DIGISAC_EM_ATENDIMENTO_TAG_NAME || 'em_atendimento';
const DIGISAC_CNPJ_MAX_RETRIES = 2;
const DIGISAC_SATISFACTION_TTL_MINUTES = Number(process.env.DIGISAC_SATISFACTION_TTL_MINUTES || 15);

const DIGISAC_USER_IDS = {
    'GERUZA MENDES': process.env.DIGISAC_USER_GERUZA_ID || '2f3518c3-7a5d-42c3-805d-7d33735e8303',
    'GUILHERME FENALI': process.env.DIGISAC_USER_GUILHERME_ID || 'c40ebf25-7157-40ee-ac79-1395b8fa58d2',
    'ELISANGELA': process.env.DIGISAC_USER_ELISANGELA_ID || '9cad129c-20bc-4a38-9f14-9d2fa664017c'
};

const DIGISAC_INTERNAL_REDIRECTS = {
    '.77': 'ELISANGELA',
    '.99': 'GERUZA MENDES'
};
const DIGISAC_INTERNAL_CLOSE_COMMAND = '.100';

function getCommercialOwnerRestriction(req) {
    const role = String(req.user?.role || '').trim().toLowerCase();
    const username = String(req.user?.user || '').trim().toLowerCase();
    const name = String(req.user?.name || '').trim().toLowerCase();
    if (role === 'comercial' && (username === 'geruza' || name === 'geruza mendes')) return 'GERUZA MENDES';
    if (role === 'comercial' && (username === 'elisangela' || name === 'elisangela')) return 'ELISANGELA';
    return null;
}

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

async function ensureClientesCrmTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS clientes_crm (
            cliente_nome TEXT PRIMARY KEY,
            crm_user TEXT,
            empresa INTEGER,
            codigo INTEGER,
            status TEXT,
            proxima_acao TEXT,
            data_acao DATE,
            notas TEXT,
            updated_by TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await pool.query(`ALTER TABLE clientes_crm ADD COLUMN IF NOT EXISTS crm_user TEXT`);
    await pool.query(`UPDATE clientes_crm SET crm_user = COALESCE(NULLIF(updated_by, ''), 'legacy') WHERE crm_user IS NULL`);
    await pool.query(`ALTER TABLE clientes_crm ALTER COLUMN crm_user SET NOT NULL`);
    await pool.query(`
        DO $$
        DECLARE pk_name TEXT;
        BEGIN
            SELECT conname INTO pk_name
            FROM pg_constraint
            WHERE conrelid = 'clientes_crm'::regclass
              AND contype = 'p';
            IF pk_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE clientes_crm DROP CONSTRAINT %I', pk_name);
            END IF;
        END $$;
    `);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS clientes_crm_cliente_user_uidx
        ON clientes_crm (cliente_nome, crm_user)
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS clientes_crm_historico (
            id SERIAL PRIMARY KEY,
            cliente_nome TEXT NOT NULL,
            crm_user TEXT,
            empresa INTEGER,
            codigo INTEGER,
            status TEXT,
            proxima_acao TEXT,
            data_acao DATE,
            notas TEXT,
            updated_by TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await pool.query(`ALTER TABLE clientes_crm_historico ADD COLUMN IF NOT EXISTS crm_user TEXT`);
}

async function ensureClientesContatosTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS clientes_contatos_crm (
            id SERIAL PRIMARY KEY,
            cliente_nome TEXT NOT NULL,
            empresa INTEGER,
            codigo INTEGER,
            crm_user TEXT NOT NULL,
            contato_em TIMESTAMP DEFAULT NOW(),
            canal TEXT,
            pessoa_contatada TEXT,
            cargo TEXT,
            telefone TEXT,
            email TEXT,
            motivo TEXT,
            resultado TEXT,
            humor_cliente TEXT,
            potencial TEXT,
            proxima_acao TEXT,
            data_proxima_acao DATE,
            resumo TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clientes_contatos_crm_user ON clientes_contatos_crm (crm_user, contato_em DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clientes_contatos_cliente ON clientes_contatos_crm (cliente_nome, crm_user)`);
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

async function ensureDigisacDedupeTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS digisac_webhook_dedupe (
            fingerprint TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
}

async function ensureDigisacSatisfactionSurveysTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS digisac_satisfaction_surveys (
            contact_id TEXT PRIMARY KEY,
            expires_at TIMESTAMP NOT NULL,
            answered_at TIMESTAMP,
            expired_notice_sent_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await pool.query(`ALTER TABLE digisac_satisfaction_surveys ADD COLUMN IF NOT EXISTS answered_at TIMESTAMP`);
}

function extractDigisacWebhookEventId(value) {
    if (value == null || typeof value !== 'object') return '';
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = extractDigisacWebhookEventId(item);
            if (found) return found;
        }
        return '';
    }

    const eventKeys = ['eventId', 'event_id', 'messageId', 'message_id', 'uuid', 'identifier', 'identificador'];
    for (const key of eventKeys) {
        if (typeof value[key] === 'string' && value[key].trim()) {
            return value[key].trim();
        }
    }

    for (const child of Object.values(value)) {
        const found = extractDigisacWebhookEventId(child);
        if (found) return found;
    }

    return '';
}

function getDigisacWebhookFingerprintData(req) {
    const contactId = req.body?.contactId || req.body?.contact_id || req.query.contactId || req.query.contact_id || findContactIdInPayload(req.body) || '';
    const command = String(req.body?.command || req.body?.comando || req.query.command || req.query.comando || findCommandInPayload(req.body) || '').trim().toLowerCase();
    const text = String(getDigisacMessageText(req) || findTextInPayload(req.body) || '').trim().toLowerCase();
    const document = onlyDigits(getRawDocumentoInput(req) || findDocumentInPayload(req.body) || findFirstObjectWithCnpjField(req.body) || '');
    const eventId = String(req.body?.data?.message?.id || req.body?.data?.id || extractDigisacWebhookEventId(req.body) || '').trim();
    return { contactId, command, text, document, eventId };
}

function buildDigisacRequestFingerprint(req) {
    const fingerprintData = getDigisacWebhookFingerprintData(req);
    return crypto.createHash('sha256').update(stableStringify(fingerprintData)).digest('hex');
}

function isDigisacWebhookFromBot(req) {
    const body = req.body || {};
    if (body.event && body.event !== 'message.created') return true;
    if (body.data?.isFromMe || body.isFromMe) return true;

    const origin = String(body.data?.origin || body.origin || body.origem || '').trim().toLowerCase();
    if (['bot', 'ticket', 'system', 'auto'].includes(origin)) return true;

    const type = String(body.data?.type || body.type || '').trim().toLowerCase();
    if (type && type !== 'chat') return true;

    const contactId = req.body?.contactId || req.body?.contact_id || findContactIdInPayload(body);
    const senderId = extractDigisacSenderId(body);
    if (senderId && contactId && senderId !== contactId) return true;

    return valueHasBotOrigin(body);
}

function extractDigisacSenderId(value) {
    if (!value || typeof value !== 'object') return '';
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = extractDigisacSenderId(item);
            if (found) return found;
        }
        return '';
    }

    const directKeys = ['fromId', 'from_id', 'senderId', 'sender_id', 'authorId', 'author_id', 'userId', 'user_id'];
    for (const key of directKeys) {
        if (typeof value[key] === 'string' && value[key].trim()) {
            return value[key].trim();
        }
    }

    for (const child of Object.values(value)) {
        const found = extractDigisacSenderId(child);
        if (found) return found;
    }

    return '';
}

function valueHasBotOrigin(value) {
    if (value == null || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some(valueHasBotOrigin);

    const origin = String(value.origin || value.origem || value.source || value.type || '').trim().toLowerCase();
    if (['bot', 'ticket', 'system', 'auto'].includes(origin)) return true;

    if (typeof value.isFromMe === 'boolean' && value.isFromMe) return true;

    for (const child of Object.values(value)) {
        if (valueHasBotOrigin(child)) return true;
    }

    return false;
}

async function ensureDigisacClienteSessionsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS digisac_cliente_sessions (
            contact_id TEXT PRIMARY KEY,
            documento TEXT,
            responsavel_comercial TEXT,
            cliente JSONB,
            etapa TEXT,
            tentativas_cnpj INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
    await pool.query(`ALTER TABLE digisac_cliente_sessions ADD COLUMN IF NOT EXISTS etapa TEXT`);
    await pool.query(`ALTER TABLE digisac_cliente_sessions ADD COLUMN IF NOT EXISTS tentativas_cnpj INTEGER DEFAULT 0`);
}

async function ensureDigisacInternalRedirectsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS digisac_internal_redirect_sessions (
            contact_id TEXT PRIMARY KEY,
            target_name TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
}

async function ensureDigisacManualCloseSuppressionsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS digisac_manual_close_suppressions (
            contact_id TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
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
    const candidates = [
        req.body?.opcao,
        req.body?.option,
        req.query.opcao,
        req.query.option,
        req.body?.data?.message?.text,
        req.body?.data?.message?.body,
        req.body?.data?.message?.content,
        req.body?.message?.text,
        req.body?.message?.body,
        req.body?.message?.content,
        req.body?.data?.text,
        req.body?.data?.body,
        req.body?.data?.content,
        req.body?.text,
        req.body?.body,
        req.body?.content
    ];

    for (const candidate of candidates) {
        if (typeof candidate === 'string' || typeof candidate === 'number') {
            const text = String(candidate).trim();
            if (text) return text;
        }
    }

    return '';
}

function isLikelyDigisacPromptText(text) {
    if (!text) return false;
    const normalized = String(text).trim().toLowerCase();
    if (!normalized) return false;

    const promptPatterns = [
        'escolha uma opção',
        'responda apenas com o número',
        'deseja continuar com este cadastro',
        'ok, vamos continuar com este cadastro',
        'identificamos seu cadastro conforme seu último contato conosco',
        'cadastro identificado',
        'seja bem-vindo à fundição erus',
        'enquanto isso, escolha uma opção',
        'enquanto isso, conte-nos qual assunto voce deseja tratar',
        'responda 1 para falar com o comercial',
        'responda 1 para continuar com este cadastro',
        'responda 2 para informar outro cadastro'
    ];

    return promptPatterns.some(pattern => normalized.includes(pattern));
}

function findFirstDigisacOptionInPayload(value) {
    if (value == null) return '';

    if (typeof value === 'string' || typeof value === 'number') {
        const text = String(value).trim();
        if (/^[0-9]$/.test(text)) return text;
        return '';
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findFirstDigisacOptionInPayload(item);
            if (found) return found;
        }
        return '';
    }

    if (typeof value === 'object') {
        const preferredKeys = ['opcao', 'option', 'answer', 'resposta', 'value', 'valor', 'text', 'texto', 'message', 'mensagem'];
        for (const key of preferredKeys) {
            const found = findFirstDigisacOptionInPayload(value[key]);
            if (found) return found;
        }

        for (const key of ['data', 'body', 'message', 'content']) {
            const found = findFirstDigisacOptionInPayload(value[key]);
            if (found) return found;
        }
    }

    return '';
}

function hasDigisacUserContent(req) {
    const messageText = getDigisacMessageText(req);
    if (messageText && !isLikelyDigisacPromptText(messageText)) {
        return true;
    }

    const documento = getRawDocumentoInput(req) || findDocumentInPayload(req.body) || findFirstObjectWithCnpjField(req.body);
    if (documento) return true;

    return false;
}

function extractDigisacUserOption(req) {
    const directOption = req.body?.opcao || req.body?.option || req.query.opcao || req.query.option;
    if (/^[0-9]$/.test(String(directOption || '').trim())) {
        return String(directOption).trim();
    }

    const messageText = getDigisacMessageText(req);
    if (!messageText) return '';
    if (isLikelyDigisacPromptText(messageText)) return '';

    const trimmed = String(messageText).trim();
    if (/^[1-3]$/.test(trimmed)) return trimmed;
    return '';
}

function extractDigisacInternalRedirect(req) {
    const text = String(getDigisacMessageText(req) || findTextInPayload(req.body) || '').trim().toLowerCase();
    return DIGISAC_INTERNAL_REDIRECTS[text] || '';
}

function isDigisacManualCloseCommand(req) {
    const text = String(getDigisacMessageText(req) || findTextInPayload(req.body) || '').trim().toLowerCase();
    return text === DIGISAC_INTERNAL_CLOSE_COMMAND;
}

function buildDigisacExpiredSatisfactionMessage() {
    return 'O prazo para responder a pesquisa de satisfação expirou.\n\nPor favor, não envie uma nota agora, pois isso pode iniciar um novo atendimento automaticamente.';
}

function isLikelyDigisacSatisfactionSurveyText(text) {
    const normalized = String(text || '').trim().toLowerCase();
    if (!normalized) return false;
    return normalized.includes('como você avalia o atendimento')
        || normalized.includes('como voce avalia o atendimento')
        || (
            normalized.includes('excelente')
            && normalized.includes('bom')
            && normalized.includes('regular')
            && normalized.includes('ruim')
            && normalized.includes('muito ruim')
        );
}

async function saveDigisacSatisfactionSurvey(contactId, expiresAt) {
    if (!contactId || !expiresAt) return null;

    await ensureDigisacSatisfactionSurveysTable();
    await pool.query(`
        INSERT INTO digisac_satisfaction_surveys (contact_id, expires_at, answered_at, expired_notice_sent_at, updated_at)
        VALUES ($1, $2, NULL, NULL, NOW())
        ON CONFLICT (contact_id)
        DO UPDATE SET
            expires_at = EXCLUDED.expires_at,
            answered_at = NULL,
            expired_notice_sent_at = NULL,
            updated_at = NOW()
    `, [contactId, expiresAt]);

    return { success: true, contactId, expiresAt };
}

async function markDigisacSatisfactionAnswered(contactId) {
    if (!contactId) return null;

    await ensureDigisacSatisfactionSurveysTable();
    const result = await pool.query(`
        UPDATE digisac_satisfaction_surveys
        SET answered_at = NOW(), updated_at = NOW()
        WHERE contact_id = $1
          AND answered_at IS NULL
          AND expired_notice_sent_at IS NULL
        RETURNING contact_id
    `, [contactId]);

    return { success: result.rowCount > 0 };
}

async function processExpiredDigisacSatisfactionSurveys() {
    await ensureDigisacSatisfactionSurveysTable();

    const result = await pool.query(`
        SELECT contact_id
        FROM digisac_satisfaction_surveys
        WHERE answered_at IS NULL
          AND expired_notice_sent_at IS NULL
          AND expires_at <= NOW()
          AND expires_at >= NOW() - INTERVAL '10 minutes'
        ORDER BY expires_at ASC
        LIMIT 20
    `);

    for (const row of result.rows) {
        const pending = await pool.query(`
            SELECT contact_id
            FROM digisac_satisfaction_surveys
            WHERE contact_id = $1
              AND answered_at IS NULL
              AND expired_notice_sent_at IS NULL
              AND expires_at <= NOW()
            LIMIT 1
        `, [row.contact_id]);
        if (pending.rowCount === 0) continue;

        const notification = await sendDigisacMessage(row.contact_id, buildDigisacExpiredSatisfactionMessage());
        await pool.query(`
            UPDATE digisac_satisfaction_surveys
            SET expired_notice_sent_at = NOW(), updated_at = NOW()
            WHERE contact_id = $1
        `, [row.contact_id]);
        if (!notification?.success) {
            console.warn('Aviso de pesquisa expirada Digisac não confirmado:', row.contact_id);
        }
    }

    return { success: true, processed: result.rows.length };
}

function startDigisacSatisfactionExpiryWorker() {
    if (global.__digisacSatisfactionExpiryWorkerStarted) return;
    global.__digisacSatisfactionExpiryWorkerStarted = true;

    setInterval(() => {
        processExpiredDigisacSatisfactionSurveys().catch(err => {
            console.warn('Erro ao processar pesquisas expiradas Digisac:', err.message);
        });
    }, 60000).unref();
}

async function handleDigisacInternalRedirect(contactId, targetName) {
    if (!contactId || !targetName) {
        return { success: true, ignored: true, action: 'internal_redirect_missing_contact' };
    }

    await ensureDigisacInternalRedirectsTable();
    const active = await pool.query(`
        SELECT target_name
        FROM digisac_internal_redirect_sessions
        WHERE contact_id = $1
          AND updated_at >= NOW() - INTERVAL '4 hours'
        LIMIT 1
    `, [contactId]);

    const activeTarget = active.rows[0]?.target_name || '';
    if (activeTarget && activeTarget !== targetName) {
        const activeDisplay = activeTarget === 'GERUZA MENDES' ? 'Geruza' : 'Elisangela';
        const blockedNotification = await sendDigisacMessage(
            contactId,
            `Seu atendimento já está em andamento com ${activeDisplay}.\n\nPara trocar de atendente, solicite a transferência diretamente na conversa atual.`
        );
        return {
            success: true,
            ignored: true,
            action: 'internal_redirect_blocked_active_attendance',
            currentTarget: activeTarget,
            requestedTarget: targetName,
            notification: blockedNotification
        };
    }

    const notification = await sendDigisacMessage(contactId, `Conversa transferida para ${targetName === 'GERUZA MENDES' ? 'Geruza' : 'Elisangela'}.`);
    const transfer = await transferDigisacTicketTo(
        contactId,
        DIGISAC_COMERCIAL_DEPARTMENT_ID,
        DIGISAC_USER_IDS[targetName] || null,
        `Atalho interno: atendimento redirecionado para ${targetName}.`
    );
    const atendimentoTag = await addDigisacEmAtendimentoTag(contactId);
    await pool.query(`
        INSERT INTO digisac_internal_redirect_sessions (contact_id, target_name, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (contact_id)
        DO UPDATE SET target_name = EXCLUDED.target_name, updated_at = NOW()
    `, [contactId, targetName]);
    await clearDigisacClienteSession(contactId);

    return {
        success: true,
        action: 'atalho_interno_digisac',
        target: targetName,
        notification,
        transfer,
        atendimentoTag
    };
}

async function clearDigisacInternalRedirectSession(contactId) {
    if (!contactId) return null;
    await ensureDigisacInternalRedirectsTable();
    await pool.query('DELETE FROM digisac_internal_redirect_sessions WHERE contact_id = $1', [contactId]);
    return { success: true };
}

async function closeDigisacTicket(contactId, comments) {
    if (!contactId) return null;
    const body = { comments: comments || 'Atendimento encerrado manualmente pelo atalho interno .100.' };
    const encoded = encodeURIComponent(contactId);
    const candidates = [
        { path: `/contacts/${encoded}/ticket/close`, method: 'POST' },
        { path: `/contacts/${encoded}/ticket/close`, method: 'PATCH' },
        { path: `/contacts/${encoded}/ticket/finish`, method: 'POST' }
    ];

    for (const candidate of candidates) {
        const result = await requestDigisacJson(candidate.path, {
            method: candidate.method,
            body
        });
        if (result) return { success: true, path: candidate.path, method: candidate.method };
    }

    return { success: false, reason: 'ticket_close_endpoint_not_confirmed' };
}

async function handleDigisacManualClose(contactId) {
    if (!contactId) {
        return { success: true, ignored: true, action: 'manual_close_missing_contact' };
    }

    const notification = await sendDigisacMessage(contactId, 'Atendimento encerrado manualmente.\n\nVocê encerrou o chamado manualmente.');
    await ensureDigisacManualCloseSuppressionsTable();
    await pool.query(`
        INSERT INTO digisac_manual_close_suppressions (contact_id, created_at)
        VALUES ($1, NOW())
        ON CONFLICT (contact_id)
        DO UPDATE SET created_at = NOW()
    `, [contactId]);
    await clearDigisacClienteSession(contactId);
    await clearDigisacInternalRedirectSession(contactId);
    await markDigisacSatisfactionAnswered(contactId);
    const close = await closeDigisacTicket(contactId, 'Atendimento encerrado manualmente via atalho interno .100. Não enviar pesquisa de satisfação.');

    return {
        success: true,
        action: 'manual_close_digisac_ticket',
        notification,
        close
    };
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

function isManualCnpjFormatValid(value) {
    return /^\d{14}$/.test(String(value || '').trim());
}

function getManualCnpjInput(req) {
    const rawDocumento = getRawDocumentoInput(req);
    if (rawDocumento) return rawDocumento;

    const messageText = getDigisacMessageText(req);
    if (messageText) return messageText;

    return findDocumentInPayload(req.body) || '';
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

function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    const parts = keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${parts.join(',')}}`;
}

function normalizeRequestBody(req) {
    return stableStringify(req.body || {});
}

async function isDuplicateDigisacRequest(req) {
    try {
        await ensureDigisacDebugTable();
        await ensureDigisacDedupeTable();
        const fingerprint = buildDigisacRequestFingerprint(req);
        const result = await pool.query(`
            INSERT INTO digisac_webhook_dedupe (fingerprint, created_at)
            VALUES ($1, NOW())
            ON CONFLICT (fingerprint) DO UPDATE
            SET created_at = EXCLUDED.created_at
            WHERE digisac_webhook_dedupe.created_at < NOW() - INTERVAL '10 seconds'
            RETURNING fingerprint
        `, [fingerprint]);
        return result.rowCount === 0;
    } catch (err) {
        console.warn('Erro ao verificar duplicado Digisac:', err.message);
        return false;
    }
}

async function saveDigisacClienteSession(contactId, documento, row, etapa = 'menu_opcoes') {
    if (!contactId || !row) return null;

    await ensureDigisacClienteSessionsTable();
    await pool.query(`
        INSERT INTO digisac_cliente_sessions (contact_id, documento, responsavel_comercial, cliente, etapa, tentativas_cnpj, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, $5, 0, NOW())
        ON CONFLICT (contact_id)
        DO UPDATE SET
            documento = EXCLUDED.documento,
            responsavel_comercial = EXCLUDED.responsavel_comercial,
            cliente = EXCLUDED.cliente,
            etapa = EXCLUDED.etapa,
            tentativas_cnpj = 0,
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

async function saveDigisacFlowSession(contactId, etapa, tentativasCnpj = 0) {
    if (!contactId || !etapa) return null;

    await ensureDigisacClienteSessionsTable();
    await pool.query(`
        INSERT INTO digisac_cliente_sessions (contact_id, etapa, tentativas_cnpj, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (contact_id)
        DO UPDATE SET
            etapa = EXCLUDED.etapa,
            tentativas_cnpj = EXCLUDED.tentativas_cnpj,
            updated_at = NOW()
    `, [contactId, etapa, tentativasCnpj]);

    return { success: true };
}

async function getDigisacClienteSession(contactId) {
    if (!contactId) return null;

    await ensureDigisacClienteSessionsTable();
    const result = await pool.query(`
        SELECT contact_id, documento, responsavel_comercial, cliente, etapa, tentativas_cnpj, updated_at
        FROM digisac_cliente_sessions
        WHERE contact_id = $1
          AND updated_at >= NOW() - INTERVAL '30 minutes'
          AND COALESCE(etapa, '') <> 'cnpj_salvo'
        LIMIT 1
    `, [contactId]);

    return result.rows[0] || null;
}

async function getDigisacStoredClienteSession(contactId) {
    if (!contactId) return null;

    await ensureDigisacClienteSessionsTable();
    const result = await pool.query(`
        SELECT contact_id, documento, responsavel_comercial, cliente, etapa, tentativas_cnpj, updated_at
        FROM digisac_cliente_sessions
        WHERE contact_id = $1
          AND documento IS NOT NULL
          AND cliente IS NOT NULL
        LIMIT 1
    `, [contactId]);

    return result.rows[0] || null;
}

async function clearDigisacClienteSession(contactId) {
    if (!contactId) return null;

    await ensureDigisacClienteSessionsTable();
    await pool.query(`
        UPDATE digisac_cliente_sessions
        SET etapa = 'cnpj_salvo', tentativas_cnpj = 0, updated_at = NOW()
        WHERE contact_id = $1
          AND documento IS NOT NULL
          AND cliente IS NOT NULL
    `, [contactId]);
    await pool.query(`
        DELETE FROM digisac_cliente_sessions
        WHERE contact_id = $1
          AND (documento IS NULL OR cliente IS NULL)
    `, [contactId]);
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

function extractDigisacRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.rows)) return payload.rows;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
}

async function getDigisacEmAtendimentoTagId() {
    if (DIGISAC_EM_ATENDIMENTO_TAG_ID) return DIGISAC_EM_ATENDIMENTO_TAG_ID;

    const payload = await fetchDigisacJson('/tags');
    const tagName = DIGISAC_EM_ATENDIMENTO_TAG_NAME.toLowerCase();
    const tag = extractDigisacRows(payload).find(item => {
        const name = String(item?.name || item?.label || item?.title || '').trim().toLowerCase();
        return name === tagName;
    });

    return tag?.id || '';
}

async function addDigisacEmAtendimentoTag(contactId) {
    if (!contactId) return null;

    const tagId = await getDigisacEmAtendimentoTagId();
    if (!tagId) return { success: false, reason: 'tag_not_found' };

    const result = await requestDigisacJson(`/contacts/${encodeURIComponent(contactId)}/tags`, {
        method: 'POST',
        body: { tagId }
    });

    return { success: !!result, tagId };
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

    const directKeys = ['contactId', 'contact_id', 'idContato', 'contatoId', 'fromId', 'from_id', 'senderId', 'sender_id', 'userId', 'user_id'];
    for (const key of directKeys) {
        const candidate = value[key];
        if (candidate != null) {
            const str = String(candidate).trim();
            if (str) return str;
        }
    }

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

async function getCurrentClienteForDigisacSession(session) {
    const documento = onlyDigits(session?.documento || getSessionClienteValue(session, 'cnpjCpf'));
    if (!documento) return session?.cliente || null;

    const current = await findClienteByDocumento(documento);
    if (current) return current;

    return {
        ...session.cliente,
        responsavel_comercial: session.responsavel_comercial
    };
}

async function refreshDigisacSessionClienteAtual(session) {
    if (!session?.cliente) return session;

    const currentCliente = await getCurrentClienteForDigisacSession(session);
    return {
        ...session,
        cliente: currentCliente,
        responsavel_comercial: currentCliente?.responsavel_comercial || null
    };
}

function buildDigisacMessage(row) {
    if (!row) {
        return '❌ Não encontramos cadastro para o CNPJ/CPF informado. Nossa equipe comercial já foi acionada e em breve dará continuidade ao atendimento.';
    }
    const nome = row.razao_social || row.razaoSocial || row.fantasia || 'cliente';
    return `✅ Identificamos seu cadastro!\n\n*Cliente:* ${nome}\n\nAgora, escolha o atendimento desejado:\n\n1️⃣ - Falar com o Comercial\n2️⃣ - Solicitar 2ª via de boleto\n3️⃣ - Solicitar 2ª via de nota fiscal\n\n*Responda apenas com o número da opção desejada.*`;
}

function getSessionClienteValue(session, key) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    return session?.cliente?.[key] || session?.cliente?.[snakeKey] || '';
}

function buildDigisacSavedCnpjConfirmationMessage(row) {
    const nome = row?.razao_social || row?.fantasia || 'cliente';
    const documento = row?.cnpj_cpf || row?.cnpjCpf || '';
    return `Olá! Tudo bem? A Fundição Erus agradece o seu contato. 🇧🇷\n\nIdentificamos seu cadastro com base no seu último contato.\n\n*CNPJ/CPF:* ${documento}\n*Cliente:* ${nome}\n\nDeseja atendimento para essa mesma empresa?\n\n1️⃣ - Sim\n2️⃣ - Não\n\n*Responda apenas com o número da opção desejada.*`;
}

function buildDigisacContinueWithCadastroMessage() {
    return 'Ok, vamos continuar com este cadastro.\n\nAgora, escolha o atendimento desejado:\n\n1️⃣ - Falar com o Comercial\n\n2️⃣ - Solicitar 2ª via de boleto\n\n3️⃣ - Solicitar 2ª via de nota fiscal\n\n*Responda apenas com o número da opção desejada*';
}

function getDigisacGreetingByCurrentHour() {
    const hourText = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        hour12: false
    }).format(new Date());
    const hour = Number(hourText);

    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
}

function formatDigisacResponsavelDisplayName(responsavelComercial) {
    const responsavel = String(responsavelComercial || '').trim();
    if (!responsavel) return 'Responsável Comercial';

    return responsavel
        .toLowerCase()
        .split(/\s+/)
        .map(part => part ? part.charAt(0).toUpperCase() + part.slice(1) : part)
        .join(' ');
}

function buildDigisacCommercialRedirectMessage() {
    return '✅ Cadastro identificado!\n\nSeu atendimento já está sendo direcionado ao responsável comercial.\n\nPara agilizar, informe por favor qual assunto deseja tratar.';
}

function buildDigisacCommercialReceptionMessage(responsavelComercial) {
    const nomeResponsavel = formatDigisacResponsavelDisplayName(responsavelComercial);
    const cumprimento = getDigisacGreetingByCurrentHour();

    return `*${nomeResponsavel}:*\n${cumprimento}. Tudo bem? Como posso ajudar?`;
}

function buildDigisacCommercialDepartmentReceptionMessage() {
    const cumprimento = getDigisacGreetingByCurrentHour();

    return `*Comercial:*\n${cumprimento}! Tudo bem? Como podemos ajudar?`;
}

function buildDigisacFinancialReceptionMessage() {
    const cumprimento = getDigisacGreetingByCurrentHour();

    return `*Financeiro:*\n${cumprimento}, Tudo bem? Como posso ajudar?`;
}

function buildDigisacWelcomeMessage() {
    return 'Olá! Seja bem-vindo à *Fundição Erus*. 🇧🇷\n\nVocê entrou em contato com o *Setor Comercial*.\n\nComo podemos ajudá-lo?\n\n1️⃣ - Já sou cliente\n2️⃣ - Não sou cliente\n\nResponda apenas com o número da opção desejada.';
}

function buildDigisacInvalidInitialOptionMessage() {
    return '⚠️ Opção inválida.\n\nPor favor, responda apenas com o número da opção desejada:\n\n1️⃣ - Já sou cliente\n2️⃣ - Não sou cliente\n\nNão envie textos ou outros números.';
}

function buildDigisacInvalidMenuOptionMessage() {
    return '⚠️ Opção inválida.\n\nPor favor, responda apenas com o número da opção desejada:\n\n1️⃣ - Falar com o Comercial\n2️⃣ - Solicitar a 2ª via de boleto\n3️⃣ - Solicitar a 2ª via de nota fiscal\n\n*Não envie textos ou outros números.*';
}

function buildDigisacInvalidSavedCnpjConfirmationOptionMessage() {
    return '⚠️ Opção inválida.\n\nPor favor, responda apenas com o número da opção desejada:\n\n1️⃣ - Sim\n2️⃣ - Não\n\n*Não envie textos ou outros números.*';
}

function buildDigisacCnpjRequestMessage() {
    return 'Para identificarmos seu cadastro e direcionarmos seu atendimento ao consultor responsavel, informe o CNPJ da empresa.\n\nImportante: Informe apenas os numeros do CNPJ, sem pontos, barras ou tracos.\n\nExemplo: `12345678000199`';
}

function buildDigisacInvalidCnpjMessage() {
    return '⚠️ Não foi possível localizar o CNPJ informado.\n\nIsso pode ter acontecido porque o CNPJ não foi encontrado em nossa base de clientes ou porque foi informado em um formato inválido.\n\n*Importante:* Informe apenas os números do CNPJ, sem pontos, barras ou traços.\n\n*Exemplo:* `12345678000199`\n\nPor favor, verifique o CNPJ e tente novamente.';
}

function buildDigisacCnpjAttemptsExceededMessage() {
    return 'Não foi possível localizar um CNPJ válido após algumas tentativas.\n\nVamos retornar ao início para começar novamente.';
}

async function handleDigisacInvalidManualCnpj(contactId, session) {
    const attempts = Number(session?.tentativas_cnpj || 0) + 1;

    if (attempts <= DIGISAC_CNPJ_MAX_RETRIES) {
        await saveDigisacFlowSession(contactId, 'aguardando_cnpj_manual', attempts);
        const notification = await sendDigisacMessage(contactId, buildDigisacInvalidCnpjMessage());

        return {
            success: true,
            found: false,
            encontrado: 'nao',
            action: 'cnpj_manual_invalido',
            pendingDocument: true,
            attempts,
            tentativasRestantes: DIGISAC_CNPJ_MAX_RETRIES - attempts,
            notification
        };
    }

    await saveDigisacFlowSession(contactId, 'aguardando_tipo_cliente', 0);
    const notification = await sendDigisacMessage(contactId, buildDigisacCnpjAttemptsExceededMessage());
    const restartNotification = await sendDigisacMessage(contactId, buildDigisacWelcomeMessage());

    return {
        success: true,
        found: false,
        encontrado: 'nao',
        action: 'cnpj_manual_tentativas_esgotadas',
        startDefaultFlow: true,
        notification,
        restartNotification
    };
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

        const commercialOwner = getCommercialOwnerRestriction(req);
        const params = commercialOwner ? [commercialOwner] : [];
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
        ${commercialOwner ? 'WHERE rc.responsavel_comercial = $1' : ''}
        ORDER BY c.razao_social NULLS LAST, c.codigo
        `, params);

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

        const earlyCommand = String(req.body?.command || req.body?.comando || req.query.command || req.query.comando || findCommandInPayload(req.body) || '').trim().toLowerCase();
        const earlyContactId = req.body?.contactId || req.body?.contact_id || req.query.contactId || req.query.contact_id || findContactIdInPayload(req.body);
        const earlyMessageText = getDigisacMessageText(req) || findTextInPayload(req.body);
        const isFlowWebhookCommand = ['consulta_cliente', 'consulta_cnpj_contato', 'consulta_contato', 'verifica_cnpj_contato', 'opcao_cliente'].includes(earlyCommand);
        const earlyTextCommand = String(earlyMessageText || '').trim().toLowerCase();
        const isInternalShortcutCommand = earlyTextCommand === DIGISAC_INTERNAL_CLOSE_COMMAND || Boolean(DIGISAC_INTERNAL_REDIRECTS[earlyTextCommand]);
        const earlySatisfactionReplyText = String(earlyMessageText || '').trim();
        if (/^[1-5]$/.test(earlySatisfactionReplyText)) {
            await markDigisacSatisfactionAnswered(earlyContactId);
        }

        if (isDigisacWebhookFromBot(req) && isLikelyDigisacSatisfactionSurveyText(earlyMessageText)) {
            const expiresAt = new Date(Date.now() + DIGISAC_SATISFACTION_TTL_MINUTES * 60000);
            const result = await saveDigisacSatisfactionSurvey(earlyContactId, expiresAt);
            return res.json({
                success: true,
                action: 'pesquisa_satisfacao_detectada',
                expiresAt,
                result
            });
        }

        if (isDigisacWebhookFromBot(req) && !isFlowWebhookCommand && !isInternalShortcutCommand) {
            return res.json({ success: true, ignored: true, action: 'bot_message', message: 'Evento Digisac originado pelo bot ignorado.' });
        }

        if (await isDuplicateDigisacRequest(req)) {
            return res.json({ success: true, ignored: true, action: 'duplicate_request', message: 'Duplicado Digisac ignorado.' });
        }

        await saveDigisacDebug(req, null);
        await ensureResponsaveisTable();
        await ensureDigisacClienteSessionsTable();
        const contactId = req.body?.contactId || req.body?.contact_id || req.query.contactId || req.query.contact_id || findContactIdInPayload(req.body);
        const directCommand = String(req.body?.command || req.body?.comando || req.query.command || req.query.comando || '').trim();
        const command = directCommand || String(findCommandInPayload(req.body) || '').trim();
        let commandNormalized = command.toLowerCase();
        if (isDigisacManualCloseCommand(req)) {
            await saveDigisacDebug(req, DIGISAC_INTERNAL_CLOSE_COMMAND);
            const result = await handleDigisacManualClose(contactId);
            return res.json(result);
        }
        const internalRedirectTarget = extractDigisacInternalRedirect(req);
        if (internalRedirectTarget) {
            await saveDigisacDebug(req, internalRedirectTarget);
            const result = await handleDigisacInternalRedirect(contactId, internalRedirectTarget);
            return res.json(result);
        }
        const session = await getDigisacClienteSession(contactId);
        const incomingOption = extractDigisacUserOption(req);
        if (!commandNormalized && session && incomingOption) {
            commandNormalized = 'opcao_cliente';
        }

        if (session?.etapa === 'aguardando_cnpj_manual') {
            const manualCnpjInput = getManualCnpjInput(req);
            await saveDigisacDebug(req, onlyDigits(manualCnpjInput) || null);

            if (!manualCnpjInput && !hasDigisacUserContent(req)) {
                return res.json({ success: true, ignored: true, action: 'waiting_manual_cnpj', message: 'Ignorado: aguardando CNPJ manual.' });
            }

            if (!isManualCnpjFormatValid(manualCnpjInput)) {
                const invalidResult = await handleDigisacInvalidManualCnpj(contactId, session);
                return res.json(invalidResult);
            }

            const documentoManual = manualCnpjInput.trim();
            const rowManual = await findClienteByDocumento(documentoManual);
            if (!rowManual) {
                const invalidResult = await handleDigisacInvalidManualCnpj(contactId, session);
                return res.json({
                    ...invalidResult,
                    documento: documentoManual
                });
            }

            await saveDigisacClienteSession(contactId, documentoManual, rowManual, 'menu_opcoes');
            const notification = await sendDigisacMessage(contactId, buildDigisacMessage(rowManual));

            return res.json({
                success: true,
                found: true,
                encontrado: 'sim',
                action: 'menu_opcoes_cliente',
                pendingSelection: true,
                responsavel_comercial: rowManual.responsavel_comercial || null,
                responsavelComercial: rowManual.responsavel_comercial || null,
                notification,
                cliente: {
                    empresa: rowManual.empresa,
                    codigo: rowManual.codigo,
                    razaoSocial: rowManual.razao_social,
                    fantasia: rowManual.fantasia,
                    cnpjCpf: rowManual.cnpj_cpf,
                    responsavelComercial: rowManual.responsavel_comercial
                }
            });
        }

        if (session?.etapa === 'aguardando_tipo_cliente') {
            const messageText = getDigisacMessageText(req);
            const hasUserInput = Boolean(String(messageText || '').trim());
            await saveDigisacDebug(req, incomingOption || session.documento || null);

            if (incomingOption === '1') {
                await saveDigisacFlowSession(contactId, 'aguardando_cnpj_manual');
                const notification = await sendDigisacMessage(contactId, buildDigisacCnpjRequestMessage());

                return res.json({
                    success: true,
                    found: false,
                    encontrado: 'nao',
                    action: 'solicitar_cnpj_cliente',
                    pendingDocument: true,
                    notification
                });
            }

            if (incomingOption === '2') {
                await clearDigisacClienteSession(contactId);
                const notification = await sendDigisacMessage(contactId, '👋 Seja bem-vindo(a) à Fundição Erus!\n\nSua solicitação foi recebida com sucesso e já está sendo encaminhada ao nosso time Comercial.\n\nEm breve, um de nossos atendentes dará continuidade ao seu atendimento.\n\nAgradecemos por escolher a Fundição Erus!');
                const receptionNotification = await sendDigisacMessage(contactId, buildDigisacCommercialDepartmentReceptionMessage());
                const transfer = await transferDigisacTicketTo(
                    contactId,
                    DIGISAC_COMERCIAL_DEPARTMENT_ID,
                    null,
                    'Contato informou que nao e cliente. Transferido automaticamente para o departamento Comercial.'
                );
                const atendimentoTag = await addDigisacEmAtendimentoTag(contactId);

                return res.json({
                    success: true,
                    found: false,
                    encontrado: 'nao',
                    action: 'nao_cliente_comercial',
                    notification,
                    receptionNotification,
                    atendimentoTag,
                    transfer
                });
            }

            if (incomingOption || hasUserInput) {
                const notification = await sendDigisacMessage(contactId, buildDigisacInvalidInitialOptionMessage());
                return res.json({
                    success: true,
                    found: false,
                    encontrado: 'nao',
                    action: 'opcao_invalida_inicio',
                    notification
                });
            }

            return res.json({ success: true, ignored: true, action: 'waiting_cliente_type_option', message: 'Ignorado: aguardando opcao 1 ou 2 sobre tipo de cliente.' });
        }

        if (['consulta_cliente', 'consulta_cnpj_contato', 'consulta_contato', 'verifica_cnpj_contato'].includes(commandNormalized)) {
            const opcao = incomingOption;
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
                        sent_by_backend: !!notification,
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
                        sent_by_backend: !!notification,
                        notification
                    });
                }

                if (session?.etapa === 'menu_opcoes' && !opcao) {
                    return res.json({ success: true, ignored: true, action: 'waiting_menu_option', message: 'Ignorado: aguardando opcao explicita do menu.' });
                }

                if (opcao === '2') {
                    await saveDigisacClienteSession(contactId, session.documento, {
                        ...session.cliente,
                        responsavel_comercial: session.responsavel_comercial
                    }, 'aguardando_tipo_cliente');
                    const notification = await sendDigisacMessage(contactId, buildDigisacWelcomeMessage());

                    return res.json({
                        success: true,
                        found: false,
                        encontrado: 'nao',
                        action: 'iniciar_fluxo_comercial',
                        startDefaultFlow: true,
                        sent_by_backend: !!notification,
                        notification
                    });
                }

                const notification = await sendDigisacMessage(contactId, buildDigisacInvalidSavedCnpjConfirmationOptionMessage());
                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    action: 'confirmar_cnpj_salvo',
                    pendingConfirmation: true,
                    invalidOption: true,
                    notification
                });
            }

            if (session?.etapa === 'menu_opcoes' && !opcao) {
                await saveDigisacClienteSession(contactId, session.documento, {
                    ...session.cliente,
                    responsavel_comercial: session.responsavel_comercial
                }, 'confirmacao_cnpj_salvo');
                const notification = await sendDigisacMessage(contactId, buildDigisacSavedCnpjConfirmationMessage(session.cliente));
                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    action: 'confirmar_cnpj_salvo',
                    pendingConfirmation: true,
                    responsavel_comercial: session.responsavel_comercial,
                    responsavelComercial: session.responsavel_comercial,
                    sent_by_backend: !!notification,
                    notification
                });
            }

            if (session?.etapa === 'menu_opcoes' && opcao) {
                await saveDigisacDebug(req, opcao || session.documento || null);

                if (opcao === '2') {
                    const notification = await sendDigisacMessage(contactId, '✅ Solicitação recebida!\n\nSeu atendimento será encaminhado ao setor Financeiro. Em breve, nossa equipe dará sequência ao atendimento.');
                    const receptionNotification = await sendDigisacMessage(contactId, buildDigisacFinancialReceptionMessage());
                    const clienteNome = getSessionClienteValue(session, 'razaoSocial') || getSessionClienteValue(session, 'fantasia') || 'cliente';
                    const clienteCnpj = session.documento || getSessionClienteValue(session, 'cnpjCpf') || 'nao informado';
                    const transfer = await transferDigisacTicketTo(
                        contactId,
                        DIGISAC_FINANCEIRO_DEPARTMENT_ID,
                        DIGISAC_FINANCEIRO_USER_ID,
                        `Cliente: ${clienteNome} | CNPJ: ${clienteCnpj} | Destino: Financeiro | Motivo: 2a via de boleto`
                    );
                    const atendimentoTag = await addDigisacEmAtendimentoTag(contactId);
                    await clearDigisacClienteSession(contactId);

                    return res.json({
                        success: true,
                        found: true,
                        encontrado: 'sim',
                        action: 'segunda_via_boleto',
                        responsavel_comercial: session.responsavel_comercial,
                        responsavelComercial: session.responsavel_comercial,
                        notification,
                        receptionNotification,
                        atendimentoTag,
                        transfer
                    });
                }

                if (opcao === '1' || opcao === '3') {
                    const notification = await sendDigisacMessage(contactId, buildDigisacCommercialRedirectMessage());
                    const receptionNotification = await sendDigisacMessage(contactId, buildDigisacCommercialReceptionMessage(session.responsavel_comercial));
                    const clienteNome = getSessionClienteValue(session, 'razaoSocial') || getSessionClienteValue(session, 'fantasia') || 'cliente';
                    const clienteCnpj = session.documento || getSessionClienteValue(session, 'cnpjCpf') || 'nao informado';
                    const transfer = await transferDigisacTicket(contactId, session.responsavel_comercial, clienteNome, clienteCnpj);
                    const atendimentoTag = await addDigisacEmAtendimentoTag(contactId);
                    await clearDigisacClienteSession(contactId);

                    return res.json({
                        success: true,
                        found: true,
                        encontrado: 'sim',
                        action: opcao === '1' ? 'falar_com_comercial' : 'segunda_via_nota_fiscal',
                        responsavel_comercial: session.responsavel_comercial,
                        responsavelComercial: session.responsavel_comercial,
                        sent_by_backend: !!notification,
                        notification,
                        receptionNotification,
                        transfer
                    });
                }

                if (!opcao) {
                    return res.json({ success: true, ignored: true, action: 'waiting_menu_option', message: 'Ignorado: aguardando opcao explicita do menu.' });
                }

                const notification = await sendDigisacMessage(contactId, buildDigisacInvalidMenuOptionMessage());
                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    invalidOption: true,
                    notification
                });
            }

            const storedSession = await getDigisacStoredClienteSession(contactId);
            if (storedSession) {
                const currentCliente = await getCurrentClienteForDigisacSession(storedSession);
                await saveDigisacClienteSession(contactId, storedSession.documento, currentCliente, 'confirmacao_cnpj_salvo');
                await saveDigisacDebug(req, storedSession.documento);
                const notification = await sendDigisacMessage(contactId, buildDigisacSavedCnpjConfirmationMessage(currentCliente));

                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    action: 'confirmar_cnpj_salvo',
                    pendingConfirmation: true,
                    responsavel_comercial: currentCliente.responsavel_comercial,
                    responsavelComercial: currentCliente.responsavel_comercial,
                    sent_by_backend: !!notification,
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

            await saveDigisacDebug(req, documentoContato || null);

            if (!documentoContato) {
                const notification = contactId ? await sendDigisacMessage(contactId, buildDigisacWelcomeMessage()) : null;
                if (contactId) {
                    await saveDigisacFlowSession(contactId, 'aguardando_tipo_cliente');
                }
                return res.json({
                    success: true,
                    found: false,
                    encontrado: 'nao',
                    action: 'iniciar_fluxo_comercial',
                    startDefaultFlow: true,
                    notification,
                    cliente: null
                });
            }

            const rowContato = await findClienteByDocumento(documentoContato);
            if (!rowContato) {
                const notification = contactId ? await sendDigisacMessage(contactId, buildDigisacWelcomeMessage()) : null;
                if (contactId) {
                    await saveDigisacFlowSession(contactId, 'aguardando_tipo_cliente');
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
            const opcao = incomingOption;
            let session = await getDigisacClienteSession(contactId);
            let documentoOpcao = onlyDigits(req.body?.documento || req.body?.cnpjCpf || req.body?.cnpj || req.query.documento || req.query.cnpjCpf || req.query.cnpj);
            const messageText = getDigisacMessageText(req);
            const rawDocumentoInput = getRawDocumentoInput(req);
            const hasDirectDocumento = isDocumentoFormatValid(rawDocumentoInput) || isDocumentoFormatValid(messageText);

            if (!session && messageText && !opcao && !hasDirectDocumento) {
                return res.json({ success: true, ignored: true, action: 'generic_user_message', message: 'Ignorado: mensagem generica sem opcao ou documento.' });
            }

            if (!session && !hasDigisacUserContent(req)) {
                return res.json({ success: true, ignored: true, action: 'no_user_input', message: 'Ignorado: sem conteúdo de usuário válido.' });
            }
            if (!session && !documentoOpcao) {
                documentoOpcao = findDocumentInPayload(req.body);
            }
            if (!session && documentoOpcao) {
                const rowOpcao = await findClienteByDocumento(documentoOpcao);
                if (rowOpcao && contactId) {
                    await saveDigisacClienteSession(contactId, documentoOpcao, rowOpcao);
                    session = await getDigisacClienteSession(contactId);
                } else if (contactId) {
                    await clearDigisacClienteSession(contactId);
                    session = null;
                }
            }
            session = await refreshDigisacSessionClienteAtual(session);

            if (session?.etapa === 'aguardando_tipo_cliente') {
                const messageText = getDigisacMessageText(req);
                const hasUserInput = Boolean(String(messageText || '').trim());
                await saveDigisacDebug(req, opcao || session.documento || null);

                if (opcao === '1') {
                    await saveDigisacFlowSession(contactId, 'aguardando_cnpj_manual');
                    const notification = await sendDigisacMessage(contactId, buildDigisacCnpjRequestMessage());

                    return res.json({
                        success: true,
                        found: false,
                        encontrado: 'nao',
                        action: 'solicitar_cnpj_cliente',
                        pendingDocument: true,
                        notification
                    });
                }

                if (opcao === '2') {
                    await clearDigisacClienteSession(contactId);
                    const notification = await sendDigisacMessage(contactId, '👋 Seja bem-vindo(a) à Fundição Erus!\n\nSua solicitação foi recebida com sucesso e já está sendo encaminhada ao nosso time Comercial.\n\nEm breve, um de nossos atendentes dará continuidade ao seu atendimento.\n\nAgradecemos por escolher a Fundição Erus!');
                    const receptionNotification = await sendDigisacMessage(contactId, buildDigisacCommercialDepartmentReceptionMessage());
                    const transfer = await transferDigisacTicketTo(
                        contactId,
                        DIGISAC_COMERCIAL_DEPARTMENT_ID,
                        null,
                        'Contato informou que nÃ£o Ã© cliente. Transferido automaticamente para o departamento Comercial.'
                    );

                    const atendimentoTag = await addDigisacEmAtendimentoTag(contactId);

                    return res.json({
                        success: true,
                        found: false,
                        encontrado: 'nao',
                        action: 'nao_cliente_comercial',
                        notification,
                        receptionNotification,
                        atendimentoTag,
                        transfer
                    });
                }

                if (opcao || hasUserInput) {
                    const notification = await sendDigisacMessage(contactId, buildDigisacInvalidInitialOptionMessage());
                    return res.json({
                        success: true,
                        found: false,
                        encontrado: 'nao',
                        action: 'opcao_invalida_inicio',
                        notification
                    });
                }

                return res.json({ success: true, ignored: true, action: 'waiting_cliente_type_option', message: 'Ignorado: aguardando opcao 1 ou 2 sobre tipo de cliente.' });
            }

            if (session?.etapa === 'menu_opcoes' && !opcao) {
                return res.json({ success: true, ignored: true, action: 'waiting_menu_option', message: 'Ignorado: aguardando opcao explicita do menu.' });
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
                    await saveDigisacClienteSession(contactId, session.documento, {
                        ...session.cliente,
                        responsavel_comercial: session.responsavel_comercial
                    }, 'aguardando_tipo_cliente');
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

                if (!opcao) {
                    if (!hasDigisacUserContent(req)) {
                        return res.json({ success: true, ignored: true, action: 'waiting_confirmation_option', message: 'Ignorado: aguardando opcao explicita de confirmacao.' });
                    }
                    const notification = await sendDigisacMessage(contactId, buildDigisacInvalidSavedCnpjConfirmationOptionMessage());
                    return res.json({
                        success: true,
                        found: true,
                        encontrado: 'sim',
                        action: 'confirmar_cnpj_salvo',
                        pendingConfirmation: true,
                        invalidOption: true,
                        notification
                    });
                }

                const notification = await sendDigisacMessage(contactId, buildDigisacInvalidSavedCnpjConfirmationOptionMessage());
                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    action: 'confirmar_cnpj_salvo',
                    pendingConfirmation: true,
                    invalidOption: true,
                    notification
                });
            }

            if (!contactId || !session) {
                return res.json({ success: true, ignored: true, action: 'ignored', message: 'Evento Digisac ignorado: sem sessão ativa para opcao_cliente.' });
            }

            if (opcao === '2') {
                const notification = await sendDigisacMessage(contactId, '✅ Solicitação recebida!\n\nSeu atendimento será encaminhado ao setor Financeiro. Em breve, nossa equipe dará sequência ao atendimento.');
                const receptionNotification = await sendDigisacMessage(contactId, buildDigisacFinancialReceptionMessage());
                const clienteNome = getSessionClienteValue(session, 'razaoSocial') || getSessionClienteValue(session, 'fantasia') || 'cliente';
                const clienteCnpj = session.documento || getSessionClienteValue(session, 'cnpjCpf') || 'nao informado';
                const transfer = await transferDigisacTicketTo(
                    contactId,
                    DIGISAC_FINANCEIRO_DEPARTMENT_ID,
                    DIGISAC_FINANCEIRO_USER_ID,
                    `Cliente: ${clienteNome} | CNPJ: ${clienteCnpj} | Destino: Financeiro | Motivo: 2ª via de boleto`
                );
                const atendimentoTag = await addDigisacEmAtendimentoTag(contactId);
                await clearDigisacClienteSession(contactId);

                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    action: 'segunda_via_boleto',
                    responsavel_comercial: session.responsavel_comercial,
                    responsavelComercial: session.responsavel_comercial,
                    notification,
                    receptionNotification,
                    atendimentoTag,
                    transfer
                });
            }

            if (opcao === '1' || opcao === '3') {
                const notification = await sendDigisacMessage(contactId, buildDigisacCommercialRedirectMessage());
                const receptionNotification = await sendDigisacMessage(contactId, buildDigisacCommercialReceptionMessage(session.responsavel_comercial));
                const clienteNome = getSessionClienteValue(session, 'razaoSocial') || getSessionClienteValue(session, 'fantasia') || 'cliente';
                const clienteCnpj = session.documento || getSessionClienteValue(session, 'cnpjCpf') || 'nao informado';
                const transfer = await transferDigisacTicket(contactId, session.responsavel_comercial, clienteNome, clienteCnpj);
                const atendimentoTag = await addDigisacEmAtendimentoTag(contactId);
                await clearDigisacClienteSession(contactId);

                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    action: opcao === '1' ? 'falar_com_comercial' : 'segunda_via_nota_fiscal',
                    responsavel_comercial: session.responsavel_comercial,
                    responsavelComercial: session.responsavel_comercial,
                    notification,
                    receptionNotification,
                    atendimentoTag,
                    transfer
                });
            }

            if (!opcao) {
                return res.json({ success: true, ignored: true, action: 'waiting_menu_option', message: 'Ignorado: aguardando opcao explicita do menu.' });
            }

                const notification = await sendDigisacMessage(contactId, buildDigisacInvalidMenuOptionMessage());
                return res.json({ success: true, found: true, encontrado: 'sim', invalidOption: true, notification });
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
                action: 'formato_invalido',
                formatoInvalido: true,
                cliente: null
            });
        }

        if (!documento && commandNormalized) {
            documento = findDocumentInPayload(req.body);
        }
        if (!documento && !commandNormalized) {
            const messageText = getDigisacMessageText(req);
            if (isDocumentoFormatValid(messageText)) {
                documento = onlyDigits(messageText);
            }
        }
        if (!documento && commandNormalized) {
            documento = await getCnpjFromDigisacContact(req.body?.numeroContato || req.body?.numero_contato || req.query.numeroContato || req.query.numero_contato);
        }
        if (!commandNormalized && !documento) {
            await saveDigisacDebug(req, null);

            if (session?.etapa === 'confirmacao_cnpj_salvo') {
                if (!hasDigisacUserContent(req)) {
                    return res.json({ success: true, ignored: true, action: 'waiting_confirmation_option', message: 'Ignorado: aguardando opcao explicita de confirmacao.' });
                }
                const notification = await sendDigisacMessage(contactId, buildDigisacInvalidSavedCnpjConfirmationOptionMessage());
                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    action: 'confirmar_cnpj_salvo',
                    pendingConfirmation: true,
                    invalidOption: true,
                    notification
                });
            }

            if (session?.etapa === 'menu_opcoes') {
                if (!hasDigisacUserContent(req)) {
                    return res.json({ success: true, ignored: true, action: 'waiting_menu_option', message: 'Ignorado: aguardando opcao explicita do menu.' });
                }
                const notification = await sendDigisacMessage(contactId, buildDigisacInvalidMenuOptionMessage());
                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    action: 'menu_opcoes_cliente',
                    pendingSelection: true,
                    invalidOption: true,
                    notification
                });
            }

            if (session?.etapa === 'confirmacao_cnpj_salvo') {
                const notification = await sendDigisacMessage(contactId, buildDigisacInvalidSavedCnpjConfirmationOptionMessage());
                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    action: 'confirmar_cnpj_salvo',
                    pendingConfirmation: true,
                    invalidOption: true,
                    notification
                });
            }

            if (session?.etapa === 'menu_opcoes') {
                const notification = await sendDigisacMessage(contactId, buildDigisacInvalidMenuOptionMessage());
                return res.json({
                    success: true,
                    found: true,
                    encontrado: 'sim',
                    action: 'menu_opcoes_cliente',
                    pendingSelection: true,
                    invalidOption: true,
                    notification
                });
            }

            return res.json({ success: true, ignored: true, action: 'ignored', message: 'Evento Digisac ignorado: sem comando e sem documento.' });
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

router.all('/digisac/satisfaction/start', async (req, res) => {
    try {
        if (!hasValidDigisacToken(req)) {
            return res.status(401).json({ success: false, error: 'Token Digisac inválido.' });
        }

        const contactId = req.body?.contactId || req.body?.contact_id || req.query.contactId || req.query.contact_id || findContactIdInPayload(req.body);
        const minutes = Math.max(1, Number(req.body?.ttlMinutes || req.body?.ttl_minutes || req.query.ttlMinutes || req.query.ttl_minutes || DIGISAC_SATISFACTION_TTL_MINUTES));
        const expiresAtInput = req.body?.expiresAt || req.body?.expires_at || req.query.expiresAt || req.query.expires_at;
        const expiresAt = expiresAtInput ? new Date(expiresAtInput) : new Date(Date.now() + minutes * 60000);

        if (!contactId) {
            return res.status(400).json({ success: false, error: 'contactId obrigatório.' });
        }
        if (Number.isNaN(expiresAt.getTime())) {
            return res.status(400).json({ success: false, error: 'expiresAt inválido.' });
        }

        await ensureDigisacManualCloseSuppressionsTable();
        const suppressed = await pool.query(`
            SELECT contact_id
            FROM digisac_manual_close_suppressions
            WHERE contact_id = $1
              AND created_at >= NOW() - INTERVAL '30 minutes'
            LIMIT 1
        `, [contactId]);
        if (suppressed.rowCount > 0) {
            return res.json({
                success: true,
                ignored: true,
                action: 'pesquisa_satisfacao_suprimida_encerramento_manual'
            });
        }

        const result = await saveDigisacSatisfactionSurvey(contactId, expiresAt);
        return res.json({
            ...result,
            action: 'pesquisa_satisfacao_registrada',
            ttlMinutes: minutes
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Erro ao registrar pesquisa de satisfação Digisac', details: err.message });
    }
});

router.all('/digisac/satisfaction/process-expired', async (req, res) => {
    try {
        if (!hasValidDigisacToken(req)) {
            return res.status(401).json({ success: false, error: 'Token Digisac inválido.' });
        }

        const result = await processExpiredDigisacSatisfactionSurveys();
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Erro ao processar pesquisas expiradas Digisac', details: err.message });
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

router.get('/crm', async (req, res) => {
    try {
        await ensureClientesCrmTable();
        const crmUser = String(req.user?.user || req.user?.name || '').trim();
        const role = String(req.user?.role || '').trim().toLowerCase();
        const scope = String(req.query.scope || 'mine').trim().toLowerCase();
        const canViewAll = scope === 'all' && ['admin', 'desenvolvedor'].includes(role);
        if (!crmUser && !canViewAll) {
            return res.status(400).json({ success: false, error: 'Usuário inválido.' });
        }
        const params = canViewAll ? [] : [crmUser];
        const result = await pool.query(`
            SELECT cliente_nome, crm_user, empresa, codigo, status, proxima_acao, data_acao, notas, updated_by, created_at, updated_at
            FROM clientes_crm
            ${canViewAll ? '' : 'WHERE crm_user = $1'}
            ORDER BY updated_at DESC
        `, params);
        const data = {};
        result.rows.forEach(row => {
            const key = canViewAll ? `${row.crm_user}::${row.cliente_nome}` : row.cliente_nome;
            data[key] = {
                clienteNome: row.cliente_nome,
                crmUser: row.crm_user,
                empresa: row.empresa,
                codigo: row.codigo,
                status: row.status || '',
                nextAction: row.proxima_acao || '',
                dueDate: row.data_acao ? row.data_acao.toISOString().slice(0, 10) : '',
                notes: row.notas || '',
                updatedBy: row.updated_by || '',
                createdAt: row.created_at,
                updatedAt: row.updated_at
            };
        });
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao consultar CRM de clientes', details: err.message });
    }
});

router.post('/crm', async (req, res) => {
    try {
        await ensureClientesCrmTable();
        const crmUser = String(req.user?.user || req.user?.name || '').trim();
        const userName = String(req.user?.name || req.user?.user || '').trim();
        const clienteNome = String(req.body.clienteNome || '').trim();
        const empresa = req.body.empresa === undefined || req.body.empresa === null || req.body.empresa === '' ? null : Number(req.body.empresa);
        const codigo = req.body.codigo === undefined || req.body.codigo === null || req.body.codigo === '' ? null : Number(req.body.codigo);
        const status = String(req.body.status || '').trim();
        const proximaAcao = String(req.body.nextAction || '').trim();
        const dataAcao = String(req.body.dueDate || '').trim() || null;
        const notas = String(req.body.notes || '').trim();
        const updatedBy = userName || crmUser;

        if (!clienteNome) {
            return res.status(400).json({ success: false, error: 'Cliente inválido.' });
        }
        if (!crmUser) {
            return res.status(400).json({ success: false, error: 'Usuário inválido.' });
        }
        if (empresa !== null && !Number.isInteger(empresa)) {
            return res.status(400).json({ success: false, error: 'Empresa inválida.' });
        }
        if (codigo !== null && !Number.isInteger(codigo)) {
            return res.status(400).json({ success: false, error: 'Código inválido.' });
        }

        const saved = await pool.query(`
            INSERT INTO clientes_crm (cliente_nome, crm_user, empresa, codigo, status, proxima_acao, data_acao, notas, updated_by, updated_at)
            VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), $7, NULLIF($8, ''), NULLIF($9, ''), NOW())
            ON CONFLICT (cliente_nome, crm_user)
            DO UPDATE SET
                empresa = COALESCE(EXCLUDED.empresa, clientes_crm.empresa),
                codigo = COALESCE(EXCLUDED.codigo, clientes_crm.codigo),
                status = EXCLUDED.status,
                proxima_acao = EXCLUDED.proxima_acao,
                data_acao = EXCLUDED.data_acao,
                notas = EXCLUDED.notas,
                updated_by = EXCLUDED.updated_by,
                updated_at = NOW()
            RETURNING cliente_nome, crm_user, empresa, codigo, status, proxima_acao, data_acao, notas, updated_by, created_at, updated_at
        `, [clienteNome, crmUser, empresa, codigo, status, proximaAcao, dataAcao, notas, updatedBy]);

        await pool.query(`
            INSERT INTO clientes_crm_historico (cliente_nome, crm_user, empresa, codigo, status, proxima_acao, data_acao, notas, updated_by)
            VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), $7, NULLIF($8, ''), NULLIF($9, ''))
        `, [clienteNome, crmUser, empresa, codigo, status, proximaAcao, dataAcao, notas, updatedBy]);

        const row = saved.rows[0];
        res.json({
            success: true,
            data: {
                empresa: row.empresa,
                crmUser: row.crm_user,
                codigo: row.codigo,
                status: row.status || '',
                nextAction: row.proxima_acao || '',
                dueDate: row.data_acao ? row.data_acao.toISOString().slice(0, 10) : '',
                notes: row.notas || '',
                updatedBy: row.updated_by || '',
                createdAt: row.created_at,
                updatedAt: row.updated_at
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao salvar CRM do cliente', details: err.message });
    }
});

router.post('/crm/contatos', async (req, res) => {
    try {
        await ensureClientesContatosTable();
        const crmUser = String(req.user?.user || req.user?.name || '').trim();
        const clienteNome = String(req.body.clienteNome || '').trim();
        const empresa = req.body.empresa === undefined || req.body.empresa === null || req.body.empresa === '' ? null : Number(req.body.empresa);
        const codigo = req.body.codigo === undefined || req.body.codigo === null || req.body.codigo === '' ? null : Number(req.body.codigo);
        const contatoEm = String(req.body.contatoEm || '').trim() || null;
        const canal = String(req.body.canal || '').trim();
        const pessoaContatada = String(req.body.pessoaContatada || '').trim();
        const cargo = String(req.body.cargo || '').trim();
        const telefone = String(req.body.telefone || '').trim();
        const email = String(req.body.email || '').trim();
        const motivo = String(req.body.motivo || '').trim();
        const resultado = String(req.body.resultado || '').trim();
        const humorCliente = String(req.body.humorCliente || '').trim();
        const potencial = String(req.body.potencial || '').trim();
        const proximaAcao = String(req.body.proximaAcao || '').trim();
        const dataProximaAcao = String(req.body.dataProximaAcao || '').trim() || null;
        const resumo = String(req.body.resumo || '').trim();

        if (!crmUser) return res.status(400).json({ success: false, error: 'Usuário inválido.' });
        if (!clienteNome) return res.status(400).json({ success: false, error: 'Cliente inválido.' });
        if (!canal) return res.status(400).json({ success: false, error: 'Informe o canal do contato.' });
        if (!resultado) return res.status(400).json({ success: false, error: 'Informe o resultado do contato.' });
        if (!resumo) return res.status(400).json({ success: false, error: 'Informe o resumo do contato.' });
        if (empresa !== null && !Number.isInteger(empresa)) return res.status(400).json({ success: false, error: 'Empresa inválida.' });
        if (codigo !== null && !Number.isInteger(codigo)) return res.status(400).json({ success: false, error: 'Código inválido.' });

        const result = await pool.query(`
            INSERT INTO clientes_contatos_crm (
                cliente_nome, empresa, codigo, crm_user, contato_em, canal, pessoa_contatada, cargo,
                telefone, email, motivo, resultado, humor_cliente, potencial, proxima_acao,
                data_proxima_acao, resumo
            )
            VALUES ($1,$2,$3,$4,COALESCE($5::timestamp, NOW()),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
            RETURNING *
        `, [
            clienteNome, empresa, codigo, crmUser, contatoEm, canal, pessoaContatada, cargo,
            telefone, email, motivo, resultado, humorCliente, potencial, proximaAcao,
            dataProximaAcao, resumo
        ]);

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao registrar contato com cliente', details: err.message });
    }
});

router.get('/crm/contatos', async (req, res) => {
    try {
        await ensureClientesContatosTable();
        const crmUser = String(req.user?.user || req.user?.name || '').trim();
        if (!crmUser) return res.status(400).json({ success: false, error: 'Usuário inválido.' });
        const result = await pool.query(`
            SELECT id, cliente_nome, empresa, codigo, crm_user, contato_em, canal, pessoa_contatada,
                   cargo, telefone, email, motivo, resultado, humor_cliente, potencial, proxima_acao,
                   TO_CHAR(data_proxima_acao, 'YYYY-MM-DD') AS data_proxima_acao, resumo, created_at
            FROM clientes_contatos_crm
            WHERE crm_user = $1
            ORDER BY contato_em DESC, id DESC
            LIMIT 20
        `, [crmUser]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erro ao consultar contatos de clientes', details: err.message });
    }
});

module.exports = router;
