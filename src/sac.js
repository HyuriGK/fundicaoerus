const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { requireRole } = require('../lib/middleware');
const { ensureSacEmailNotificationsTable, enviarSacEmail, prepararSacEmail } = require('./sac-email-notifications');

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

function getCommercialOwnerRestriction(req) {
    const role = String(req.user?.role || '').trim().toLowerCase();
    const username = String(req.user?.user || '').trim().toLowerCase();
    const name = String(req.user?.name || '').trim().toLowerCase();
    if (role === 'comercial' && (username === 'geruza' || name === 'geruza mendes')) return 'GERUZA MENDES';
    if (role === 'comercial' && (username === 'elisangela' || name === 'elisangela')) return 'ELISANGELA';
    return null;
}

function addCommercialOwnerFilter(req, filters, values, alias) {
    const owner = getCommercialOwnerRestriction(req);
    if (!owner) return;
    values.push(owner);
    filters.push(`EXISTS (
        SELECT 1
        FROM clientes_firebird_sync c
        JOIN clientes_responsavel_comercial rc
            ON rc.empresa = c.empresa
            AND rc.codigo = c.codigo
        WHERE c.codigo::text = ${alias}.cliente_codigo::text
          AND rc.responsavel_comercial = $${values.length}
    )`);
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
        addCommercialOwnerFilter(req, filters, values, 's');
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const result = await pool.query(`SELECT s.codigo AS "CODIGO_SAV", s.situacao AS "SITUACAO_SAV", s.data_cadastro AS "DATA_CADASTRO_SAV", s.data_limite AS "DATA_LIMITE_SAV", s.data_resolvido AS "DATA_RESOLVIDO_SAV", s.cliente_codigo AS "CLI_CODIGO_SAV", s.cliente AS "NOME_CLIENTE_SAV", s.reclamante AS "RECLAMANTE_NOME_SAV", s.origem AS "ORIGEM_SAV", s.procedencia AS "PROCEDENCIA_SAV", s.disposicao AS "DISPOSICAO_SAV", s.total_produtos AS "TOTAL_PRODUTOS", s.total_acoes AS "TOTAL_ACOES", COALESCE((SELECT string_agg(DISTINCT concat_ws(' - ', responsavel->>'USU_CODIGO_SVU', responsavel->>'NOME_USUARIO_SVU'), ', ') FROM jsonb_array_elements(COALESCE(s.data->'responsaveis', '[]'::jsonb)) responsavel WHERE NULLIF(responsavel->>'SVAC_ID_SVU', '') IS NOT NULL), '') AS "RESPONSAVEIS_ACOES" FROM sac_firebird_sync s ${where} ORDER BY s.codigo DESC LIMIT 300`, values);
        res.json(result.rows.map(row => ({ ...row, SITUACAO_NOME: situacoes[row.SITUACAO_SAV] || 'NÃO DEFINIDO', PROCEDENCIA_NOME: procedencias[row.PROCEDENCIA_SAV] || 'NÃO DEFINIDO' })));
    } catch (error) { res.status(500).json({ error: 'Dados SAC ainda não sincronizados', details: error.message }); }
});

router.get('/acoes', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        await ensureAcoesStatusTable();
        const values = [], filters = [];
        addCommercialOwnerFilter(req, filters, values, 's');
        const result = await pool.query(`SELECT s.codigo AS "CODIGO_SAV", s.situacao AS "SITUACAO_SAC", a.acao AS "ACAO",
            COALESCE(string_agg(DISTINCT concat_ws(' - ', r.responsavel->>'USU_CODIGO_SVU', r.responsavel->>'NOME_USUARIO_SVU'), ', '), '') AS "RESPONSAVEL",
            COALESCE(string_agg(DISTINCT NULLIF(r.responsavel->>'NOME_SETOR_SVU', ''), ', '), '') AS "SETOR_RESPONSAVEL",
            COALESCE(st.concluida, false) AS "CONCLUIDA"
            FROM sac_firebird_sync s
            CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.data->'acoes', '[]'::jsonb)) a(acao)
            LEFT JOIN LATERAL jsonb_array_elements(COALESCE(s.data->'responsaveis', '[]'::jsonb)) r(responsavel)
                ON NULLIF(r.responsavel->>'SVAC_ID_SVU', '')::integer = NULLIF(a.acao->>'ID_SVAC', '')::integer
            LEFT JOIN sac_acoes_status st ON st.sac_codigo = s.codigo AND st.acao_id = NULLIF(a.acao->>'ID_SVAC', '')::integer
            ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
            GROUP BY s.codigo, s.situacao, a.acao, st.concluida
            ORDER BY NULLIF(a.acao->>'DATA_PRAZO_SVAC', '') DESC NULLS LAST, s.codigo DESC`, values);
        res.json(result.rows.map(row => ({ ...row, ACAO: normalizarRtf(row.ACAO), SITUACAO_NOME: situacoes[row.SITUACAO_SAC] || 'NÃO DEFINIDO' })));
    } catch (error) { res.status(500).json({ error: 'Ações corretivas ainda não sincronizadas', details: error.message }); }
});

router.get('/email-notifications', requireRole('desenvolvedor'), async (req, res) => {
    try {
        await ensureSacEmailNotificationsTable(pool);
        const result = await pool.query(`SELECT COALESCE(s.codigo, n.sac_codigo) AS "CODIGO_SAV", COALESCE(s.data_cadastro, n.data_cadastro) AS "DATA_CADASTRO_SAV", COALESCE(s.cliente, n.cliente) AS "NOME_CLIENTE_SAV", COALESCE(s.reclamante, n.reclamante) AS "RECLAMANTE_NOME_SAV", COALESCE(s.data->>'NOME_CADASTRADO_SAV', n.cadastrado_por_nome) AS "NOME_CADASTRADO_SAV", s.codigo IS NOT NULL AS "DISPONIVEL_DISPARO", n.status, n.regra_destinatarios, n.destinatarios, n.copias, n.motivo, n.message_id, n.enviado_em, n.atualizado_em
            FROM sac_email_notifications n
            FULL OUTER JOIN sac_firebird_sync s ON n.sac_codigo = s.codigo
            ORDER BY COALESCE(s.codigo, n.sac_codigo) DESC LIMIT 500`);
        const rows = result.rows.map(row => ({ ...row, status: row.status || 'NAO_ENVIADO', motivo: row.motivo || (row.status ? null : 'Sem registro de envio.') }));
        res.json({
            resumo: {
                total: rows.length,
                enviados: rows.filter(row => row.status === 'ENVIADO').length,
                naoEnviados: rows.filter(row => row.status !== 'ENVIADO').length
            },
            registros: rows
        });
    } catch (error) {
        res.status(500).json({ error: 'Não foi possível consultar os e-mails das SACs', details: error.message });
    }
});

router.get('/email-notifications/:codigo/preview', requireRole('desenvolvedor'), async (req, res) => {
    try {
        const codigo = Number(req.params.codigo);
        if (!Number.isInteger(codigo)) return res.status(400).json({ error: 'Código inválido' });
        const result = await pool.query('SELECT data FROM sac_firebird_sync WHERE codigo = $1', [codigo]);
        if (!result.rows.length) return res.status(404).json({ error: 'SAC não encontrada na sincronização' });
        const sac = normalizarRtf(result.rows[0].data);
        res.json({ codigo, disponivel: Boolean(prepararSacEmail(sac).to.length), ...prepararSacEmail(sac) });
    } catch (error) {
        res.status(500).json({ error: 'Não foi possível preparar o e-mail da SAC', details: error.message });
    }
});

router.post('/email-notifications/:codigo/send', requireRole('desenvolvedor'), async (req, res) => {
    try {
        if (req.body?.confirmation !== 'CONFIRMAR') return res.status(400).json({ error: 'Digite CONFIRMAR para disparar o e-mail.' });
        const codigo = Number(req.params.codigo);
        if (!Number.isInteger(codigo)) return res.status(400).json({ error: 'Código inválido' });
        const result = await pool.query('SELECT data FROM sac_firebird_sync WHERE codigo = $1', [codigo]);
        if (!result.rows.length) return res.status(404).json({ error: 'SAC não encontrada na sincronização' });
        const overrides = {};
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'to')) overrides.to = req.body.to;
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'cc')) overrides.cc = req.body.cc;
        let envio;
        try {
            envio = await enviarSacEmail(pool, normalizarRtf(result.rows[0].data), overrides);
        } catch (error) {
            if (String(error.message || '').startsWith('E-mail inválido:')) return res.status(400).json({ error: error.message });
            throw error;
        }
        if (envio.status !== 'ENVIADO') return res.status(422).json({ success: false, ...envio });
        res.json({ success: true, ...envio });
    } catch (error) {
        res.status(500).json({ error: 'Não foi possível disparar o e-mail da SAC', details: error.message });
    }
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
        const filters = ['s.codigo = $1'], values = [codigo];
        addCommercialOwnerFilter(req, filters, values, 's');
        const result = await pool.query(`SELECT s.data FROM sac_firebird_sync s WHERE ${filters.join(' AND ')}`, values);
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
