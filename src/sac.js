const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

const situacoes = { 0: 'ABERTO', 1: 'RESOLVIDO', 2: 'CANCELADO' };
const procedencias = { 0: 'NÃO DEFINIDO', 1: 'PROCEDENTE', 2: 'IMPROCEDENTE' };

function normalizarRtf(value) {
    if (typeof value === 'string') {
        const texto = /^\{\\rtf/i.test(value) ? value.replace(/\\par[d]?/gi, '\n').replace(/\\tab/gi, '\t').replace(/\\u(-?\d+)\??/g, (_, code) => String.fromCharCode((Number(code) + 65536) % 65536)).replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').replace(/\\([\\{}])/g, '$1') : value;
        return texto.replace(/(?:^|\n)\s*(?:[A-Za-z][\w -]{0,30};){1,8}\s*(?=\n|$)/g, '\n').replace(/(?:^|\n)\s*;;\s*(?=\n|$)/g, '\n').replace(/(^|\n)\s*["'](?=\S)/g, '$1').replace(/["']\s*(?=\n|$)/g, '').replace(/\n{3,}/g, '\n\n').trim();
    }
    if (Array.isArray(value)) return value.map(normalizarRtf);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizarRtf(item)]));
    return value;
}

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

router.get('/:codigo/anexos', async (req, res) => {
    try {
        const codigo = Number(req.params.codigo);
        if (!Number.isInteger(codigo)) return res.status(400).json({ error: 'Código inválido' });
        const result = await pool.query('SELECT id, anexo_codigo, nome_arquivo, mime_type, tamanho_bytes, modificado_em FROM sac_anexos_sync WHERE sac_codigo=$1 ORDER BY anexo_codigo, nome_arquivo', [codigo]);
        res.json(result.rows);
    } catch (error) { res.status(500).json({ error: 'Anexos ainda não sincronizados', details: error.message }); }
});

router.get('/anexos/:id/download', async (req, res) => {
    try {
        const result = await pool.query('SELECT nome_arquivo, mime_type, conteudo FROM sac_anexos_sync WHERE id=$1', [Number(req.params.id)]);
        if (!result.rows.length) return res.status(404).json({ error: 'Anexo não encontrado' });
        const arquivo = result.rows[0];
        res.set({ 'Content-Type': arquivo.mime_type, 'Content-Disposition': `inline; filename="${arquivo.nome_arquivo.replace(/["\\]/g, '')}"`, 'Cache-Control': 'private, max-age=3600' });
        res.send(arquivo.conteudo);
    } catch (error) { res.status(500).json({ error: 'Não foi possível abrir o anexo', details: error.message }); }
});

router.get('/detail/:codigo', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        const codigo = Number(req.params.codigo);
        if (!Number.isInteger(codigo)) return res.status(400).json({ error: 'Código inválido' });
        const result = await pool.query('SELECT data FROM sac_firebird_sync WHERE codigo = $1', [codigo]);
        if (!result.rows.length) return res.status(404).json({ error: 'SAC não encontrado na sincronização' });
        const data = normalizarRtf(result.rows[0].data);
        data.acoes = (data.acoes || []).map(acao => ({
            ...acao,
            RESPONSAVEIS: (data.responsaveis || []).filter(usuario => Number(usuario.SVAC_ID_SVU) === Number(acao.ID_SVAC)).map(usuario => `${usuario.USU_CODIGO_SVU} - ${usuario.NOME_USUARIO_SVU}`).filter(Boolean).join(', ') || '—'
        }));
        res.json({ ...data, SITUACAO_NOME: situacoes[data.SITUACAO_SAV] || 'NÃO DEFINIDO', PROCEDENCIA_NOME: procedencias[data.PROCEDENCIA_SAV] || 'NÃO DEFINIDO' });
    } catch (error) { res.status(500).json({ error: 'Erro ao consultar SAC sincronizado', details: error.message }); }
});

module.exports = router;
