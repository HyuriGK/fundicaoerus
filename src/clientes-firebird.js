const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

router.get('/list/all', async (req, res) => {
    try {
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
            empresa, codigo, razao_social, fantasia, ativo, bloqueado,
            cnpj_cpf, ie_rg, contato, telefone1, telefone2, email,
            cidade_codigo, cidade_nome, cidade_uf, cidade_latitude, cidade_longitude, cep, logradouro, numero, bairro,
            data_cadastro, data_inativacao, motivo_bloqueio, observacao, synced_at
        FROM clientes_firebird_sync
        ORDER BY razao_social NULLS LAST, codigo
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

module.exports = router;
