const pool = require('../../lib/db');
const { Firebird, options } = require('../../lib/firebird-helper');

function firebirdQuery(sql) {
    return new Promise((resolve, reject) => Firebird.attach(options, (error, db) => {
        if (error) return reject(error);
        db.query(sql, (err, rows) => { db.detach(); err ? reject(err) : resolve(rows || []); });
    }));
}

function sanitize(value) {
    if (typeof value === 'string') return value.replace(/\0/g, '');
    if (Array.isArray(value)) return value.map(sanitize);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
    }
    return value;
}

async function sync() {
    const [cabecalhos, produtos, acoes, responsaveis, causas, anexos, historico, custos] = await Promise.all([
        firebirdQuery(`SELECT s.CODIGO_SAV, s.SITUACAO_SAV, s.DATA_CADASTRO_SAV, s.DATA_LIMITE_SAV, s.DATA_RESOLVIDO_SAV, s.CLI_CODIGO_SAV, s.NOME_CLIENTE_SAV, s.CNPJ_CPF_CLIENTE_SAV, s.RECLAMANTE_NOME_SAV, s.RECLAMANTE_FONE_SAV, s.RECLAMANTE_EMAIL_SAV, s.PROCEDENCIA_SAV, s.ORIGEM_SAV, s.DISPOSICAO_SAV, s.DISPOSICAO_OBS_SAV, s.BAN_CODIGO_RESSARCIMENTO_SAV, s.CNPJ_CPF_RESSARCIMENTO_SAV, s.AGENCIA_RESSARCIMENTO_SAV, s.CONTA_RESSARCIMENTO_SAV, s.OPERACAO_RESSARCIMENTO_SAV, s.TITULAR_RESSARCIMENTO_SAV, CAST(s.RELATO_CLIENTE_SAV AS VARCHAR(8191)) RELATO_CLIENTE_TEXTO, CAST(s.CAUSA_PROBLEMA_SAV AS VARCHAR(8191)) CAUSA_PROBLEMA_TEXTO FROM SAC_VENDA s`),
        firebirdQuery(`SELECT p.*, CAST(p.PEDIDOS_SVP AS VARCHAR(8191)) PEDIDOS_TEXTO, CAST(p.RELATO_TECNICO_SVP AS VARCHAR(8191)) RELATO_TECNICO_TEXTO, CAST(p.OBSERVACAO_SVP AS VARCHAR(8191)) OBSERVACAO_TEXTO FROM SAC_VENDA_PRODUTO p`),
        firebirdQuery(`SELECT a.*, CAST(a.OBS_SVAC AS VARCHAR(8191)) OBS_TEXTO FROM SAC_VENDA_ACAO a`),
        firebirdQuery('SELECT * FROM SAC_VENDA_USUARIO'),
        firebirdQuery('SELECT c.*, o.DESCRICAO_OPP FROM SAC_VENDA_CAUSA_PROBLEMA c LEFT JOIN OCORRENCIA_PROPOSTA_COMERCIAL o ON o.CODIGO_OPP=c.OPP_CODIGO_SVCP'),
        firebirdQuery('SELECT * FROM SAC_VENDA_ANEXO'),
        firebirdQuery('SELECT h.*, CAST(h.OBSERVACAO_SVAP AS VARCHAR(8191)) OBSERVACAO_TEXTO FROM SAC_VENDA_APONTAMENTO h'),
        firebirdQuery('SELECT * FROM SAC_VENDA_OUTROS_CUSTOS')
    ]);
    const group = (rows, key) => rows.reduce((map, row) => { const id = row[key]; (map[id] ||= []).push(row); return map; }, {});
    const by = { produtos: group(produtos, 'SAV_CODIGO_SVP'), acoes: group(acoes, 'SAV_CODIGO_SVAC'), responsaveis: group(responsaveis, 'SAV_CODIGO_SVU'), causas: group(causas, 'SAV_CODIGO_SVCP'), anexos: group(anexos, 'SAV_CODIGO_SVA'), historico: group(historico, 'SAV_CODIGO_SVAP'), custos: group(custos, 'SAV_CODIGO_SVOC') };
    const client = await pool.connect();
    try {
        await client.query(`CREATE TABLE IF NOT EXISTS sac_firebird_sync (codigo INTEGER PRIMARY KEY, situacao INTEGER, data_cadastro DATE, data_limite DATE, data_resolvido DATE, cliente_codigo INTEGER, cliente TEXT, reclamante TEXT, origem TEXT, procedencia INTEGER, disposicao TEXT, total_produtos INTEGER DEFAULT 0, total_acoes INTEGER DEFAULT 0, data JSONB NOT NULL, synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
        await client.query('CREATE INDEX IF NOT EXISTS idx_sac_sync_lista ON sac_firebird_sync (situacao, data_cadastro DESC)');
        await client.query('BEGIN');
        await client.query('TRUNCATE sac_firebird_sync');
        for (const row of cabecalhos) {
            const codigo = row.CODIGO_SAV;
            const data = sanitize({ ...row, produtos: by.produtos[codigo] || [], acoes: by.acoes[codigo] || [], responsaveis: by.responsaveis[codigo] || [], causas: by.causas[codigo] || [], anexos: by.anexos[codigo] || [], historico: by.historico[codigo] || [], custos: by.custos[codigo] || [] });
            await client.query(`INSERT INTO sac_firebird_sync (codigo,situacao,data_cadastro,data_limite,data_resolvido,cliente_codigo,cliente,reclamante,origem,procedencia,disposicao,total_produtos,total_acoes,data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [codigo,row.SITUACAO_SAV,row.DATA_CADASTRO_SAV,row.DATA_LIMITE_SAV,row.DATA_RESOLVIDO_SAV,row.CLI_CODIGO_SAV,row.NOME_CLIENTE_SAV,row.RECLAMANTE_NOME_SAV,row.ORIGEM_SAV,row.PROCEDENCIA_SAV,row.DISPOSICAO_SAV,data.produtos.length,data.acoes.length,JSON.stringify(data)]);
        }
        await client.query('COMMIT');
        console.log(`SAC sincronizado: ${cabecalhos.length} atendimentos.`);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

sync().catch(error => { console.error('Falha na sincronização SAC:', error); process.exitCode = 1; }).finally(() => pool.end());
