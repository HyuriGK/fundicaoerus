const express = require('express');
const router = express.Router();
const pool = require('../lib/db');

async function ensureAcoesStatusTable() {
    await pool.query(`CREATE TABLE IF NOT EXISTS sac_acoes_status (
        sac_codigo INTEGER NOT NULL,
        acao_id INTEGER NOT NULL,
        concluida BOOLEAN NOT NULL DEFAULT false,
        concluida_em TIMESTAMPTZ,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (sac_codigo, acao_id)
    )`);
}

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
        res.set('Cache-Control', 'no-store');
        const { busca = '', situacao = '', origem = '' } = req.query;
        const filters = [], values = [];
        if (busca.trim()) {
            values.push(`%${busca.trim()}%`);
            filters.push(`(codigo::text ILIKE $${values.length} OR cliente ILIKE $${values.length} OR reclamante ILIKE $${values.length})`);
        }
        if (situacao !== '') { values.push(Number(situacao)); filters.push(`situacao = $${values.length}`); }
        if (origem.trim()) { values.push(`%${origem.trim()}%`); filters.push(`origem ILIKE $${values.length}`); }
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const result = await pool.query(`SELECT codigo AS "CODIGO_SAV", situacao AS "SITUACAO_SAV", data_cadastro AS "DATA_CADASTRO_SAV", data_limite AS "DATA_LIMITE_SAV", data_resolvido AS "DATA_RESOLVIDO_SAV", cliente_codigo AS "CLI_CODIGO_SAV", cliente AS "NOME_CLIENTE_SAV", reclamante AS "RECLAMANTE_NOME_SAV", origem AS "ORIGEM_SAV", procedencia AS "PROCEDENCIA_SAV", disposicao AS "DISPOSICAO_SAV", total_produtos AS "TOTAL_PRODUTOS", total_acoes AS "TOTAL_ACOES", COALESCE((SELECT string_agg(DISTINCT concat_ws(' - ', responsavel->>'USU_CODIGO_SVU', responsavel->>'NOME_USUARIO_SVU'), ', ') FROM jsonb_array_elements(COALESCE(data->'responsaveis', '[]'::jsonb)) responsavel WHERE NULLIF(responsavel->>'SVAC_ID_SVU', '') IS NOT NULL), '') AS "RESPONSAVEIS_ACOES" FROM sac_firebird_sync ${where} ORDER BY codigo DESC LIMIT 300`, values);
        res.json(result.rows.map(row => ({ ...row, SITUACAO_NOME: situacoes[row.SITUACAO_SAV] || 'NÃO DEFINIDO', PROCEDENCIA_NOME: procedencias[row.PROCEDENCIA_SAV] || 'NÃO DEFINIDO' })));
    } catch (error) { res.status(500).json({ error: 'Dados SAC ainda não sincronizados', details: error.message }); }
});

router.get('/:codigo/anexos', async (req, res) => {
    try {
        const codigo = Number(req.params.codigo);
        if (!Number.isInteger(codigo)) return res.status(400).json({ error: 'Código inválido' });
        const result = await pool.query("SELECT id, anexo_codigo, nome_arquivo, mime_type, tamanho_bytes, modificado_em FROM sac_anexos_sync WHERE sac_codigo=$1 AND LOWER(nome_arquivo) <> 'thumbs.db' ORDER BY anexo_codigo, nome_arquivo", [codigo]);
        res.json(result.rows);
    } catch (error) { res.status(500).json({ error: 'Anexos ainda não sincronizados', details: error.message }); }
});

router.get('/anexos/:id/download', async (req, res) => {
    try {
        const result = await pool.query('SELECT nome_arquivo, mime_type, conteudo FROM sac_anexos_sync WHERE id=$1', [Number(req.params.id)]);
        if (!result.rows.length) return res.status(404).json({ error: 'Anexo não encontrado' });
        const arquivo = result.rows[0];
        res.set({ 'Content-Type': arquivo.mime_type, 'Cache-Control': 'private, max-age=3600' });
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
        await ensureAcoesStatusTable();
        const { rows: statuses } = await pool.query('SELECT acao_id, concluida, concluida_em FROM sac_acoes_status WHERE sac_codigo = $1', [codigo]);
        const statusByAction = new Map(statuses.map(status => [Number(status.acao_id), status]));
        data.acoes = (data.acoes || []).map(acao => ({
            ...acao,
            RESPONSAVEIS: (data.responsaveis || []).filter(usuario => Number(usuario.SVAC_ID_SVU) === Number(acao.ID_SVAC)).map(usuario => `${usuario.USU_CODIGO_SVU} - ${usuario.NOME_USUARIO_SVU}`).filter(Boolean).join(', ') || '—'
        }));
        data.acoes.forEach(acao => {
            const status = statusByAction.get(Number(acao.ID_SVAC));
            acao.CONCLUIDA = Boolean(status?.concluida);
            acao.CONCLUIDA_EM = status?.concluida_em || null;
        });
        res.json({ ...data, SITUACAO_NOME: situacoes[data.SITUACAO_SAV] || 'NÃO DEFINIDO', PROCEDENCIA_NOME: procedencias[data.PROCEDENCIA_SAV] || 'NÃO DEFINIDO' });
    } catch (error) { res.status(500).json({ error: 'Erro ao consultar SAC sincronizado', details: error.message }); }
});

router.post('/:codigo/acoes/:acaoId/status', express.json(), async (req, res) => {
    try {
        const sacCodigo = Number(req.params.codigo), acaoId = Number(req.params.acaoId), concluida = Boolean(req.body?.concluida);
        if (!Number.isInteger(sacCodigo) || !Number.isInteger(acaoId)) return res.status(400).json({ error: 'Ação inválida' });
        await ensureAcoesStatusTable();
        await pool.query(`INSERT INTO sac_acoes_status (sac_codigo, acao_id, concluida, concluida_em)
            VALUES ($1, $2, $3, CASE WHEN $3 THEN NOW() ELSE NULL END)
            ON CONFLICT (sac_codigo, acao_id) DO UPDATE SET concluida = EXCLUDED.concluida, concluida_em = EXCLUDED.concluida_em, atualizado_em = NOW()`, [sacCodigo, acaoId, concluida]);
        res.json({ success: true, concluida });
    } catch (error) { res.status(500).json({ error: 'Não foi possível atualizar a ação' }); }
});

module.exports = router;
