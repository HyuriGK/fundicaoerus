const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

const RESPONSAVEIS_COMERCIAIS = new Set([
    'GERUZA MENDES',
    'GUILHERME FENALI',
    'ELISANGELA',
    'MARIA EDUARDA'
]);

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

function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

function hasValidDigisacToken(req) {
    const expected = process.env.DIGISAC_WEBHOOK_TOKEN;
    if (!expected) return true;
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const headerToken = String(req.headers['x-digisac-token'] || '').trim();
    return bearer === expected || headerToken === expected;
}

function getDigisacConfig() {
    return {
        baseUrl: String(process.env.DIGISAC_API_BASE_URL || 'https://fundicaoerus.digisac.co/api/v1').replace(/\/+$/, ''),
        token: process.env.DIGISAC_API_TOKEN
    };
}

async function fetchDigisacJson(path) {
    const { baseUrl, token } = getDigisacConfig();
    if (!token || typeof fetch !== 'function') return null;

    const response = await fetch(`${baseUrl}${path}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
        }
    });

    if (!response.ok) return null;
    return response.json();
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

function buildDigisacMessage(row) {
    if (!row) {
        return 'Não localizamos seu cadastro com o CNPJ/CPF informado. Por favor, confira o número digitado ou aguarde nosso time comercial para continuar o atendimento.';
    }
    const nomeCliente = row.razao_social || row.fantasia || 'cliente';
    if (!row.responsavel_comercial) {
        return `Identificamos seu cadastro: ${nomeCliente}. Ainda não há responsável comercial definido no sistema. Nossa equipe comercial dará continuidade ao atendimento.`;
    }
    return `Identificamos seu cadastro: ${nomeCliente}. Você será redirecionado para o responsável comercial ${row.responsavel_comercial}.`;
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
        let documento = onlyDigits(req.body?.documento || req.body?.cnpjCpf || req.body?.cnpj || req.query.documento || req.query.cnpjCpf || req.query.cnpj);
        if (!documento) {
            documento = await getCnpjFromDigisacContact(req.body?.numeroContato || req.body?.numero_contato || req.query.numeroContato || req.query.numero_contato);
        }
        if (!documento) {
            return res.json({
                success: true,
                found: false,
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
        res.json({
            success: true,
            found: !!row,
            message: buildDigisacMessage(row),
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
        res.status(500).json({ success: false, found: false, error: 'Erro ao consultar cliente para Digisac', details: err.message });
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
