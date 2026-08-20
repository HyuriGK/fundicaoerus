const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

const situacoes = { 0: 'ABERTO', 1: 'RESOLVIDO', 2: 'CANCELADO' };
const procedencias = { 0: 'NÃO DEFINIDO', 1: 'CLIENTE', 2: 'INTERNO' };

router.get('/list', async (req, res) => {
    try {
        const { busca = '', situacao = '', origem = '' } = req.query;
        const filters = [], values = [];
        if (busca.trim()) {
            values.push(`%${busca.trim()}%`);
            filters.push(`(codigo::text ILIKE $${values.length} OR cliente ILIKE $${values.length} OR reclamante ILIKE $${values.length})`);
        }
        if (situacao !== '') { values.push(Number(situacao)); filters.push(`situacao = $${values.length}`); }
        if (origem.trim()) { values.push(`%${origem.trim()}%`); filters.push(`origem ILIKE $${values.length}`); }
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const result = await pool.query(`SELECT codigo AS "CODIGO_SAV", situacao AS "SITUACAO_SAV", data_cadastro AS "DATA_CADASTRO_SAV", data_limite AS "DATA_LIMITE_SAV", data_resolvido AS "DATA_RESOLVIDO_SAV", cliente_codigo AS "CLI_CODIGO_SAV", cliente AS "NOME_CLIENTE_SAV", reclamante AS "RECLAMANTE_NOME_SAV", origem AS "ORIGEM_SAV", procedencia AS "PROCEDENCIA_SAV", disposicao AS "DISPOSICAO_SAV", total_produtos AS "TOTAL_PRODUTOS", total_acoes AS "TOTAL_ACOES" FROM sac_firebird_sync ${where} ORDER BY codigo DESC LIMIT 300`, values);
        res.json(result.rows.map(row => ({ ...row, SITUACAO_NOME: situacoes[row.SITUACAO_SAV] || 'NÃO DEFINIDO', PROCEDENCIA_NOME: procedencias[row.PROCEDENCIA_SAV] || 'NÃO DEFINIDO' })));
    } catch (error) { res.status(500).json({ error: 'Dados SAC ainda não sincronizados', details: error.message }); }
});

router.get('/detail/:codigo', async (req, res) => {
    try {
        const codigo = Number(req.params.codigo);
        if (!Number.isInteger(codigo)) return res.status(400).json({ error: 'Código inválido' });
        const result = await pool.query('SELECT data FROM sac_firebird_sync WHERE codigo = $1', [codigo]);
        if (!result.rows.length) return res.status(404).json({ error: 'SAC não encontrado na sincronização' });
        const data = result.rows[0].data;
        res.json({ ...data, SITUACAO_NOME: situacoes[data.SITUACAO_SAV] || 'NÃO DEFINIDO', PROCEDENCIA_NOME: procedencias[data.PROCEDENCIA_SAV] || 'NÃO DEFINIDO' });
    } catch (error) { res.status(500).json({ error: 'Erro ao consultar SAC sincronizado', details: error.message }); }
});

module.exports = router;
