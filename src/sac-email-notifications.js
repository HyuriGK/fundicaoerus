const nodemailer = require('nodemailer');

const SAC_EMAIL_TO = ['processos@fundicaoerus.com.br', 'humberto@fundicaoerus.com.br'];
const SAC_EMAIL_CC_GERUZA = ['relatorios@fundicaoerus.com.br', 'luis@fundicaoerus.com.br', 'comercial2@fundicaoerus.com.br', 'comercial3@fundicaoerus.com.br'];
const SAC_EMAIL_CC_ELISANGELA = ['relatorios@fundicaoerus.com.br', 'luis@fundicaoerus.com.br', 'comercial2@fundicaoerus.com.br', 'comercial@fundicaoerus.com.br'];

function normalizarNome(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function destinatariosPorCadastro(nome) {
    const cadastro = normalizarNome(nome);
    if (cadastro.includes('GERUZA')) return { to: SAC_EMAIL_TO, cc: SAC_EMAIL_CC_GERUZA, regra: 'GERUZA' };
    if (cadastro.includes('ELISANGELA')) return { to: SAC_EMAIL_TO, cc: SAC_EMAIL_CC_ELISANGELA, regra: 'ELISANGELA' };
    return null;
}

function criarTransporter() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
}

async function ensureSacEmailNotificationsTable(pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS sac_email_notifications (
        sac_codigo INTEGER PRIMARY KEY,
        data_cadastro DATE,
        cliente TEXT,
        reclamante TEXT,
        cadastrado_por_codigo INTEGER,
        cadastrado_por_nome TEXT,
        regra_destinatarios TEXT,
        destinatarios TEXT[] NOT NULL DEFAULT '{}',
        copias TEXT[] NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'NAO_ENVIADO',
        motivo TEXT,
        message_id TEXT,
        enviado_em TIMESTAMPTZ,
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query('ALTER TABLE sac_email_notifications ADD COLUMN IF NOT EXISTS data_cadastro DATE');
    await pool.query('ALTER TABLE sac_email_notifications ADD COLUMN IF NOT EXISTS cliente TEXT');
    await pool.query('ALTER TABLE sac_email_notifications ADD COLUMN IF NOT EXISTS reclamante TEXT');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_sac_email_notifications_status ON sac_email_notifications (status, atualizado_em DESC)');
}

function assuntoSac(sac) {
    return `Nova SAC #${sac.CODIGO_SAV} - ${sac.NOME_CLIENTE_SAV || 'Cliente não informado'}`;
}

function corpoSac(sac) {
    const baseUrl = String(process.env.PUBLIC_APP_URL || 'https://fundicaoerus.vercel.app').replace(/\/+$/, '');
    return [
        'Uma nova SAC foi cadastrada no SIGE.',
        '',
        `Código: #${sac.CODIGO_SAV}`,
        `Cliente: ${sac.NOME_CLIENTE_SAV || 'Não informado'}`,
        `Reclamante: ${sac.RECLAMANTE_NOME_SAV || 'Não informado'}`,
        `Origem: ${sac.ORIGEM_SAV || 'Não informado'}`,
        `Prazo: ${sac.DATA_LIMITE_SAV ? new Date(sac.DATA_LIMITE_SAV).toLocaleDateString('pt-BR') : 'Não informado'}`,
        `Cadastrado por: ${sac.NOME_CADASTRADO_SAV || sac.USU_CADASTRO_SAV || 'Não informado'}`,
        '',
        `Acessar SAC: ${baseUrl}/sac.html?sac=${encodeURIComponent(sac.CODIGO_SAV)}`
    ].join('\n');
}

function prepararSacEmail(sac) {
    const destinatarios = destinatariosPorCadastro(sac.NOME_CADASTRADO_SAV);
    return {
        regra: destinatarios?.regra || null,
        to: destinatarios?.to || [],
        cc: destinatarios?.cc || [],
        assunto: assuntoSac(sac),
        corpo: corpoSac(sac)
    };
}

async function registrarSacNaoEnviada(pool, sac, motivo, regra = null, destinatarios = [], copias = []) {
    await pool.query(`INSERT INTO sac_email_notifications
        (sac_codigo, data_cadastro, cliente, reclamante, cadastrado_por_codigo, cadastrado_por_nome, regra_destinatarios, destinatarios, copias, status, motivo, atualizado_em)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'NAO_ENVIADO',$10,NOW())
        ON CONFLICT (sac_codigo) DO UPDATE SET data_cadastro=EXCLUDED.data_cadastro, cliente=EXCLUDED.cliente,
        reclamante=EXCLUDED.reclamante, cadastrado_por_codigo=EXCLUDED.cadastrado_por_codigo,
        cadastrado_por_nome=EXCLUDED.cadastrado_por_nome, regra_destinatarios=EXCLUDED.regra_destinatarios,
        destinatarios=EXCLUDED.destinatarios, copias=EXCLUDED.copias, status='NAO_ENVIADO', motivo=EXCLUDED.motivo,
        message_id=NULL, enviado_em=NULL, atualizado_em=NOW()`,
        [sac.CODIGO_SAV, sac.DATA_CADASTRO_SAV || null, sac.NOME_CLIENTE_SAV || null, sac.RECLAMANTE_NOME_SAV || null, sac.USU_CADASTRO_SAV || null, sac.NOME_CADASTRADO_SAV || null, regra, destinatarios, copias, motivo]);
}

async function enviarSacEmail(pool, sac) {
    const preview = prepararSacEmail(sac);
    const destinatarios = preview.to.length ? { to: preview.to, cc: preview.cc, regra: preview.regra } : null;
    if (!destinatarios) {
        await registrarSacNaoEnviada(pool, sac, 'Cadastrado por não identificado para a regra de envio.');
        return { status: 'NAO_ENVIADO', motivo: 'Cadastrado por não identificado para a regra de envio.' };
    }
    const transporter = criarTransporter();
    if (!transporter) {
        await registrarSacNaoEnviada(pool, sac, 'SMTP não configurado.', destinatarios.regra, destinatarios.to, destinatarios.cc);
        return { status: 'NAO_ENVIADO', motivo: 'SMTP não configurado.' };
    }
    try {
        const info = await transporter.sendMail({
            from: `"Fundição Erus" <${process.env.EMAIL_USER}>`,
            to: destinatarios.to.join(', '),
            cc: destinatarios.cc.join(', '),
            subject: preview.assunto,
            text: preview.corpo
        });
        await pool.query(`INSERT INTO sac_email_notifications
            (sac_codigo, data_cadastro, cliente, reclamante, cadastrado_por_codigo, cadastrado_por_nome, regra_destinatarios, destinatarios, copias, status, motivo, message_id, enviado_em, atualizado_em)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ENVIADO',NULL,$10,NOW(),NOW())
            ON CONFLICT (sac_codigo) DO UPDATE SET data_cadastro=EXCLUDED.data_cadastro, cliente=EXCLUDED.cliente,
            reclamante=EXCLUDED.reclamante, cadastrado_por_codigo=EXCLUDED.cadastrado_por_codigo,
            cadastrado_por_nome=EXCLUDED.cadastrado_por_nome, regra_destinatarios=EXCLUDED.regra_destinatarios,
            destinatarios=EXCLUDED.destinatarios, copias=EXCLUDED.copias, status='ENVIADO', motivo=NULL,
            message_id=EXCLUDED.message_id, enviado_em=NOW(), atualizado_em=NOW()`,
            [sac.CODIGO_SAV, sac.DATA_CADASTRO_SAV || null, sac.NOME_CLIENTE_SAV || null, sac.RECLAMANTE_NOME_SAV || null, sac.USU_CADASTRO_SAV || null, sac.NOME_CADASTRADO_SAV || null, destinatarios.regra, destinatarios.to, destinatarios.cc, info.messageId || null]);
        return { status: 'ENVIADO', messageId: info.messageId || null };
    } catch (error) {
        await registrarSacNaoEnviada(pool, sac, error.message, destinatarios.regra, destinatarios.to, destinatarios.cc);
        return { status: 'NAO_ENVIADO', motivo: error.message };
    }
}

module.exports = { destinatariosPorCadastro, ensureSacEmailNotificationsTable, enviarSacEmail, prepararSacEmail, registrarSacNaoEnviada };
