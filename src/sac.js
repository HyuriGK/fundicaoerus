const express = require('express');
const router = express.Router();
const { Firebird, options } = require('../lib/firebird-helper');

function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        Firebird.attach(options, (error, db) => {
            if (error) return reject(error);
            db.query(sql, params, (err, rows) => {
                db.detach();
                if (err) reject(err); else resolve(rows);
            });
        });
    });
}

const situacoes = { 0: 'ABERTO', 1: 'RESOLVIDO', 2: 'CANCELADO' };
const procedencias = { 0: 'NÃO DEFINIDO', 1: 'CLIENTE', 2: 'INTERNO' };

router.get('/list', async (req, res) => {
    try {
        const { busca = '', situacao = '', origem = '' } = req.query;
        const filters = [], params = [];
        if (busca.trim()) {
            filters.push('(CAST(s.CODIGO_SAV AS VARCHAR(20)) CONTAINING ? OR s.NOME_CLIENTE_SAV CONTAINING ? OR s.RECLAMANTE_NOME_SAV CONTAINING ?)');
            params.push(busca.trim(), busca.trim(), busca.trim());
        }
        if (situacao !== '') { filters.push('s.SITUACAO_SAV = ?'); params.push(Number(situacao)); }
        if (origem.trim()) { filters.push('s.ORIGEM_SAV CONTAINING ?'); params.push(origem.trim()); }
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const rows = await query(`SELECT FIRST 300 s.CODIGO_SAV, s.SITUACAO_SAV, s.DATA_CADASTRO_SAV, s.DATA_LIMITE_SAV, s.DATA_RESOLVIDO_SAV, s.CLI_CODIGO_SAV, s.NOME_CLIENTE_SAV, s.RECLAMANTE_NOME_SAV, s.ORIGEM_SAV, s.PROCEDENCIA_SAV, s.DISPOSICAO_SAV,
            (SELECT COUNT(*) FROM SAC_VENDA_PRODUTO p WHERE p.SAV_CODIGO_SVP=s.CODIGO_SAV) TOTAL_PRODUTOS,
            (SELECT COUNT(*) FROM SAC_VENDA_ACAO a WHERE a.SAV_CODIGO_SVAC=s.CODIGO_SAV) TOTAL_ACOES
            FROM SAC_VENDA s ${where} ORDER BY s.CODIGO_SAV DESC`, params);
        res.json(rows.map(row => ({ ...row, SITUACAO_NOME: situacoes[row.SITUACAO_SAV] || 'NÃO DEFINIDO', PROCEDENCIA_NOME: procedencias[row.PROCEDENCIA_SAV] || 'NÃO DEFINIDO' })));
    } catch (error) { res.status(500).json({ error: 'Erro ao consultar SAC', details: error.message }); }
});

router.get('/detail/:codigo', async (req, res) => {
    try {
        const codigo = Number(req.params.codigo);
        if (!Number.isInteger(codigo)) return res.status(400).json({ error: 'Código inválido' });
        const [cabecalho] = await query(`SELECT s.CODIGO_SAV, s.SITUACAO_SAV, s.DATA_CADASTRO_SAV, s.DATA_LIMITE_SAV, s.DATA_RESOLVIDO_SAV, s.CLI_CODIGO_SAV, s.NOME_CLIENTE_SAV, s.CNPJ_CPF_CLIENTE_SAV, s.RECLAMANTE_NOME_SAV, s.RECLAMANTE_FONE_SAV, s.RECLAMANTE_EMAIL_SAV, s.PROCEDENCIA_SAV, s.ORIGEM_SAV, s.DISPOSICAO_SAV, s.DISPOSICAO_OBS_SAV, s.BAN_CODIGO_RESSARCIMENTO_SAV, s.CNPJ_CPF_RESSARCIMENTO_SAV, s.AGENCIA_RESSARCIMENTO_SAV, s.CONTA_RESSARCIMENTO_SAV, s.OPERACAO_RESSARCIMENTO_SAV, s.TITULAR_RESSARCIMENTO_SAV, CAST(s.RELATO_CLIENTE_SAV AS VARCHAR(8191)) RELATO_CLIENTE_TEXTO, CAST(s.CAUSA_PROBLEMA_SAV AS VARCHAR(8191)) CAUSA_PROBLEMA_TEXTO FROM SAC_VENDA s WHERE s.CODIGO_SAV=?`, [codigo]);
        if (!cabecalho) return res.status(404).json({ error: 'SAC não encontrado' });
        const [produtos, acoes, responsaveis, causas, anexos, historico, custos] = await Promise.all([
            query('SELECT p.*, CAST(p.PEDIDOS_SVP AS VARCHAR(8191)) PEDIDOS_TEXTO, CAST(p.RELATO_TECNICO_SVP AS VARCHAR(8191)) RELATO_TECNICO_TEXTO, CAST(p.OBSERVACAO_SVP AS VARCHAR(8191)) OBSERVACAO_TEXTO FROM SAC_VENDA_PRODUTO p WHERE p.SAV_CODIGO_SVP=? ORDER BY p.SEQUENCIA_SVP', [codigo]),
            query('SELECT a.*, CAST(a.OBS_SVAC AS VARCHAR(8191)) OBS_TEXTO FROM SAC_VENDA_ACAO a WHERE a.SAV_CODIGO_SVAC=? ORDER BY a.ORDEM_SVAC', [codigo]),
            query('SELECT * FROM SAC_VENDA_USUARIO WHERE SAV_CODIGO_SVU=? ORDER BY NOME_USUARIO_SVU', [codigo]),
            query('SELECT c.*, o.DESCRICAO_OPP FROM SAC_VENDA_CAUSA_PROBLEMA c LEFT JOIN OCORRENCIA_PROPOSTA_COMERCIAL o ON o.CODIGO_OPP=c.OPP_CODIGO_SVCP WHERE c.SAV_CODIGO_SVCP=?', [codigo]),
            query('SELECT * FROM SAC_VENDA_ANEXO WHERE SAV_CODIGO_SVA=? ORDER BY DATA_SVA DESC', [codigo]),
            query('SELECT h.*, CAST(h.OBSERVACAO_SVAP AS VARCHAR(8191)) OBSERVACAO_TEXTO FROM SAC_VENDA_APONTAMENTO h WHERE h.SAV_CODIGO_SVAP=? ORDER BY h.DATA_SVAP DESC, h.HORA_SVAP DESC', [codigo]),
            query('SELECT * FROM SAC_VENDA_OUTROS_CUSTOS WHERE SAV_CODIGO_SVOC=? ORDER BY ID_SVOC', [codigo])
        ]);
        res.json({ ...cabecalho, SITUACAO_NOME: situacoes[cabecalho.SITUACAO_SAV] || 'NÃO DEFINIDO', PROCEDENCIA_NOME: procedencias[cabecalho.PROCEDENCIA_SAV] || 'NÃO DEFINIDO', produtos, acoes, responsaveis, causas, anexos, historico, custos });
    } catch (error) { res.status(500).json({ error: 'Erro ao consultar detalhe do SAC', details: error.message }); }
});

module.exports = router;
