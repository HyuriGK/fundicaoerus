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
