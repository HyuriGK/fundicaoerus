const express = require('express');
const router = express.Router();
const { attach } = require('../lib/firebird-helper');

const clean = value => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text === '' ? null : text;
};

router.get('/list/all', (req, res) => {
    const sql = `
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

    attach((err, db) => {
        if (err) return res.status(500).json({ success: false, error: 'Erro ao conectar no Firebird', details: err.message });

        db.query(sql, (queryErr, rows) => {
            db.detach();
            if (queryErr) {
                return res.status(500).json({ success: false, error: 'Erro ao consultar clientes no Firebird', details: queryErr.message });
            }

            const data = (rows || []).map(row => ({
                empresa: row.EMPRESA_CLI,
                codigo: row.CODIGO_CLI,
                razaoSocial: clean(row.RAZAO_SOCIAL_CLI),
                fantasia: clean(row.FANTASIA_CLI),
                ativo: clean(row.ATIVO_CLI) === 'S',
                bloqueado: clean(row.BLOQUEADO_CLI) === 'S',
                cnpjCpf: clean(row.CNPJ_CPF_CLI),
                ieRg: clean(row.IE_RG_CLI),
                contato: clean(row.CONTATO_CLI),
                telefone1: clean(row.FONE1_CLI),
                telefone2: clean(row.FONE2_CLI),
                email: clean(row.EMAIL_COMERCIAL_CLI) || clean(row.EMAIL_CLI) || clean(row.EMAIL_NFE_CLI),
                cidadeCodigo: row.CIDADE_CLI,
                cep: clean(row.CEP_CLI),
                logradouro: clean(row.LOGRADOURO_CLI),
                numero: clean(row.NUMERO_CLI),
                bairro: clean(row.BAIRRO_CLI),
                dataCadastro: row.DATA_CLI,
                dataInativacao: row.DATA_INATIVACAO_CLI,
                motivoBloqueio: clean(row.MOTIVO_BLOQUEIO_CLI),
                observacao: clean(row.OBSERVACAO_IMPORTANTE_CLI)
            }));

            res.json({ success: true, data, total: data.length });
        });
    });
});

module.exports = router;
