/**
 * Script de envio automático diário de emails:
 *   1. Pedidos Bloqueados (carteira atual)
 *   2. Pedidos Emitidos (dia útil anterior)
 *
 * Uso: node scripts/email-diario-pedidos.js [bloqueados|novos|ambos]
 * Agendar no Windows Task Scheduler para rodar diariamente em horário comercial.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const nodemailer = require('nodemailer');
const { Pool } = require('pg');

// ─── CONFIG ────────────────────────────────────────────────────────────────────

const EMAIL_DESTINO = process.env.EMAIL_RELATORIO_DESTINO || 'luis@fundicaoerus.com.br';
const EMAIL_CC      = process.env.EMAIL_RELATORIO_CC      || 'pcp1@fundicaoerus.com.br, pcp2@fundicaoerus.com.br, comercial@fundicaoerus.com.br, comercial2@fundicaoerus.com.br, engenharia@fundicaoerus.com.br, processos@fundicaoerus.com.br, relatorios@fundicaoerus.com.br';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL.replace(/^psql '|'$/g, ''),
    ssl: { rejectUnauthorized: false }
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ─── FERIADOS NACIONAIS (ano fixo — atualize anualmente) ───────────────────────
const FERIADOS = new Set([
    '2025-01-01','2025-03-03','2025-03-04','2025-04-18','2025-04-21',
    '2025-05-01','2025-06-19','2025-09-07','2025-10-12','2025-11-02',
    '2025-11-15','2025-11-20','2025-12-25',
    '2026-01-01','2026-02-16','2026-02-17','2026-04-03','2026-04-21',
    '2026-05-01','2026-06-04','2026-09-07','2026-10-12','2026-11-02',
    '2026-11-15','2026-11-20','2026-12-25',
]);

function isBusinessDay(date) {
    const day = date.getDay();
    if (day === 0 || day === 6) return false;
    const iso = date.toISOString().slice(0, 10);
    return !FERIADOS.has(iso);
}

function previousBusinessDay(from = new Date()) {
    const d = new Date(from);
    do { d.setDate(d.getDate() - 1); } while (!isBusinessDay(d));
    return d;
}

function formatDate(d) {
    return d.toLocaleDateString('pt-BR');
}

function formatNum(v, dec = 2) {
    if (v === null || isNaN(v)) return '0,00';
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ─── LÓGICA DE CÁLCULO (igual ao frontend) ─────────────────────────────────────

function getCommercialBalance(item) {
    const qty   = parseFloat(item.QUANTIDADE_PPR)             || 0;
    const fat   = parseFloat(item.QUANTIDADE_FATURADA_PPR)    || 0;
    const desist = parseFloat(item.QUANTIDADE_DESISTENCIA_PPR) || 0;
    return qty - fat - desist;
}

function getCorrectedWeight(item, customWeights = {}) {
    const cod = String(item.PRODUTO_PPR || '').trim();
    const custom = customWeights[cod];
    const weightUn = custom != null ? parseFloat(custom) : (parseFloat(item.PESO_BRUTO_PPR) || parseFloat(item.PESO_LIQUIDO_PPR) || 0);
    return weightUn * getCommercialBalance(item);
}

function calcBusinessDays(startDate, endDate) {
    if (!startDate) return 0;
    const start = new Date(startDate); start.setHours(0,0,0,0);
    const end   = new Date(endDate);   end.setHours(0,0,0,0);
    if (start > end) return 0;
    let count = 0;
    const cur = new Date(start);
    while (cur < end) {
        cur.setDate(cur.getDate() + 1);
        if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
    }
    return count;
}

function truncate(str, max = 50) {
    return str.length > max ? str.slice(0, 47) + '...' : str;
}

// ─── BUSCA DADOS ────────────────────────────────────────────────────────────────

async function fetchPedidos() {
    const result = await pool.query(`
        SELECT p.sync_key, p.data,
               f.pro_codigo_fic AS has_ficha
        FROM   firebird_sync_emissoes p
        LEFT JOIN ficha_tecnica f ON f.pro_codigo_fic = (p.data->>'PRODUTO_PPR')
        LEFT JOIN pedidos_op_links l ON l.sync_key = p.sync_key
        WHERE  ((p.data->>'QUANTIDADE_PPR')::numeric
                - COALESCE((p.data->>'QUANTIDADE_FATURADA_PPR')::numeric, 0)
                - COALESCE((p.data->>'QUANTIDADE_DESISTENCIA_PPR')::numeric, 0)) > 0
          AND  (p.data->>'STATUS_PPR') <> 'C'
        LIMIT 1500
    `);

    const linksResult = await pool.query('SELECT sync_key, op, status FROM pedidos_op_links');
    const linksMap = {};
    linksResult.rows.forEach(l => { linksMap[l.sync_key] = l; });

    return result.rows.map(row => {
        const item = { ...row.data, sync_key: row.sync_key, _has_ficha: !!row.has_ficha };
        const link = linksMap[row.sync_key];
        if (link) {
            if (link.status === 'confirmado') { item.LINK_STATUS = 'confirmado'; item.OP_PCS = link.op; }
            else if (link.status === 'rejeitado' && item.LINK_STATUS !== 'oficial') {
                item.LINK_STATUS = 'rejeitado'; item.OP_PCS = null;
            }
        }
        return item;
    });
}

async function fetchCustomWeights() {
    const result = await pool.query('SELECT codigo, peso FROM pesos_customizados');
    const map = {};
    result.rows.forEach(r => { map[r.codigo] = r.peso; });
    return map;
}

// ─── GERADOR: NOVOS PEDIDOS ─────────────────────────────────────────────────────

function gerarEmailNovos(allData, customWeights) {
    const today  = new Date();
    const target = previousBusinessDay(today);

    const isSameDay = (d1, d2) =>
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth()    === d2.getMonth()    &&
        d1.getDate()     === d2.getDate();

    const list = allData.filter(item => {
        if (!item.DATA_EMISSAO_PEDIDO) return false;
        if (String(item.PRODUTO_PPR || '').trim().endsWith('1')) return false;
        if (String(item.FATURADO_PPR || '').trim().toUpperCase() === 'T') return false;
        if (getCommercialBalance(item) <= 0) return false;
        return isSameDay(new Date(item.DATA_EMISSAO_PEDIDO), target);
    });

    if (!list.length) return null;

    const uniqueOrders = new Set(list.map(i => i.CODIGO_PPR)).size;
    let totalQtd = 0, totalPeso = 0;
    const byClient = {};

    list.forEach(item => {
        const qtd    = getCommercialBalance(item);
        const weight = getCorrectedWeight(item, customWeights);
        totalQtd  += qtd;
        totalPeso += weight;
        const client = item.NOME_CLIENTE || 'CLIENTE DESCONHECIDO';
        if (!byClient[client]) byClient[client] = [];
        byClient[client].push({ ...item, _qtd: qtd, _weight: weight });
    });

    const weekday  = target.toLocaleDateString('pt-BR', { weekday: 'long' });
    const dateStr  = formatDate(target);
    const genStr   = formatDate(today);

    let text = `Assunto: Novos Pedidos Incluídos - ${genStr}\n\n`;
    text += `Prezados,\n\n`;
    text += `Foram incluídos novos pedidos na carteira ${weekday} (${dateStr}):\n\n`;
    text += `• Total de Novos Pedidos: ${uniqueOrders}\n`;
    text += `• Quantidade Total: ${totalQtd} pçs\n`;
    text += `• Peso Total Adicionado: ${formatNum(totalPeso)} kg (Podem ter pesos zerados)\n\n`;
    text += `Lista Detalhada:\n`;

    Object.keys(byClient).sort().forEach(client => {
        text += `--------------------------------------------------\n`;
        text += `CLIENTE: ${client}\n`;
        text += `--------------------------------------------------\n`;
        byClient[client].forEach(i => {
            const entrega = i.ENTREGA_PETR ? formatDate(new Date(i.ENTREGA_PETR))
                          : i.DATA_ENTREGA_PPR ? formatDate(new Date(i.DATA_ENTREGA_PPR)) : 'Sem Data';
            const desc    = truncate(i.NOME_PRODUTO_PPR || i.PRODUTO_PPR || 'SEM DESCRIÇÃO');
            const pesoUn  = i._qtd > 0 ? i._weight / i._qtd : 0;
            const ficha   = i._has_ficha ? '' : ' (SEM FICHA TÉCNICA)';
            text += `• Ped: ${i.CODIGO_PPR || '-'} | Cód: ${i.PRODUTO_PPR || '-'}${ficha} | Entrega: ${entrega}\n`;
            text += `Desc: ${desc}\n`;
            text += `Mat: ${i.NOME_MATERIAL || '-'} | Qtd: ${i._qtd} | Peso Un: ${formatNum(pesoUn)} | Total: ${formatNum(i._weight)} kg\n\n`;
        });
    });

    text += `\nAtenciosamente,\nSistema de Gestão Comercial\nFundição Erus\n`;
    return { subject: `Novos Pedidos Incluídos - ${genStr}`, text };
}

// ─── GERADOR: PEDIDOS BLOQUEADOS ────────────────────────────────────────────────

function gerarEmailBloqueados(allData, customWeights) {
    const today = new Date();

    const list = allData.filter(item => {
        if (String(item.PRODUTO_PPR || '').trim().endsWith('1')) return false;
        if (String(item.FATURADO_PPR || '').trim().toUpperCase() === 'T') return false;
        if (getCommercialBalance(item) <= 0) return false;

        const noOP     = !item.OP_PCS || item.OP_PCS === '-' || String(item.OP_PCS).trim() === '';
        const blocked  = item.STATUS_PED === 'B' || item.STATUS_PPR === 'B' ||
                         (item.STATUS_DESC_PED && String(item.STATUS_DESC_PED).toUpperCase().includes('BLOQ'));
        const noDate   = !item.ENTREGA_PETR && !item.DATA_ENTREGA_PPR;
        return blocked || noDate || noOP;
    });

    if (!list.length) return null;

    const uniqueOrders = new Set(list.map(i => i.CODIGO_PPR)).size;
    let totalQtd = 0, totalPeso = 0;
    const byClient = {};

    list.forEach(item => {
        const qtd    = getCommercialBalance(item);
        const weight = getCorrectedWeight(item, customWeights);
        totalQtd  += qtd;
        totalPeso += weight;
        const client = item.NOME_CLIENTE || 'CLIENTE DESCONHECIDO';
        if (!byClient[client]) byClient[client] = [];
        byClient[client].push({ ...item, _qtd: qtd, _weight: weight });
    });

    const genStr = formatDate(today);

    let text = `Assunto: Resumo de Pedidos Bloqueados na Carteira - ${genStr}\n\n`;
    text += `Prezados,\n\n`;
    text += `Este e-mail é enviado a todos os setores para que cada um verifique a situação de cada peça em sua área e auxilie no fluxo necessário para o desbloqueio do pedido.\n\n`;
    text += `Segue o resumo de todos os itens atualmente bloqueados na carteira de pedidos:\n\n`;
    text += `• Total de Pedidos Bloqueados: ${uniqueOrders}\n`;
    text += `• Quantidade Bloqueada Total: ${totalQtd} pçs\n`;
    text += `• Peso Bloqueado Total: ${formatNum(totalPeso)} kg (podem ter pesos zerados)\n\n`;
    text += `Lista de Bloqueios Pendentes:\n`;

    Object.keys(byClient).sort().forEach(client => {
        text += `--------------------------------------------------\n`;
        text += `CLIENTE: ${client}\n`;
        text += `--------------------------------------------------\n`;
        byClient[client].forEach(i => {
            const emissao  = i.DATA_EMISSAO_PEDIDO ? formatDate(new Date(i.DATA_EMISSAO_PEDIDO)) : 'Sem Data';
            const desc     = truncate(i.NOME_PRODUTO_PPR || i.PRODUTO_PPR || 'SEM DESCRIÇÃO');
            const hasDt    = i.ENTREGA_PETR || i.DATA_ENTREGA_PPR;
            const descOrig = i.STATUS_DESC_PED || '';
            const noOP     = !i.OP_PCS || i.OP_PCS === '-' || String(i.OP_PCS).trim() === '';
            const manual   = i.STATUS_PED === 'B' || i.STATUS_PPR === 'B' || descOrig.toUpperCase().includes('BLOQ');
            const dias     = calcBusinessDays(i.DATA_EMISSAO_PEDIDO, today);
            const ficha    = i._has_ficha ? '' : ' (SEM FICHA TÉCNICA)';

            let motivo = '';
            if (!hasDt)                          motivo = 'Aguardando data de entrega (Sem data)';
            if (manual)                          motivo = descOrig ? descOrig.trim() : 'Bloqueio manual no sistema';
            if (noOP && hasDt && !manual)        motivo = 'Desbloqueado, mas SEM OP vinculada';

            text += `• Ped: ${i.CODIGO_PPR || '-'} | Emissão: ${emissao} | Dias Bloqueado: ${dias}\n`;
            text += `Cód: ${i.PRODUTO_PPR || '-'}${ficha}\n`;
            text += `Desc: ${desc}\n`;
            text += `Motivo: ${motivo}\n`;
            text += `Qtd: ${i._qtd} | Peso Total Bloqueado: ${formatNum(i._weight)} kg\n\n`;
        });
    });

    text += `\nAtenciosamente,\nSistema de Gestão Comercial\nFundição Erus\n`;
    return { subject: `Resumo de Pedidos Bloqueados - ${genStr}`, text };
}

// ─── ENVIO ───────────────────────────────────────────────────────────────────────

async function sendEmail(subject, text) {
    const mailOptions = {
        from:    `"Fundição Erus" <${process.env.EMAIL_USER}>`,
        to:      EMAIL_DESTINO,
        subject,
        text,
    };
    if (EMAIL_CC) mailOptions.cc = EMAIL_CC;
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email enviado: ${subject} → ${info.messageId}`);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────────

async function main() {
    const modo = process.argv[2] || 'ambos'; // 'novos' | 'bloqueados' | 'ambos'

    try {
        console.log(`🚀 Iniciando email-diario-pedidos [${modo}] — ${new Date().toLocaleString('pt-BR')}`);

        const [allData, customWeights] = await Promise.all([fetchPedidos(), fetchCustomWeights()]);
        console.log(`📦 ${allData.length} pedidos carregados.`);

        if (modo === 'novos' || modo === 'ambos') {
            const email = gerarEmailNovos(allData, customWeights);
            if (email) await sendEmail(email.subject, email.text);
            else       console.log('ℹ️  Nenhum pedido novo (dia útil anterior) — email não enviado.');
        }

        if (modo === 'bloqueados' || modo === 'ambos') {
            const email = gerarEmailBloqueados(allData, customWeights);
            if (email) await sendEmail(email.subject, email.text);
            else       console.log('ℹ️  Nenhum pedido bloqueado — email não enviado.');
        }

    } catch (err) {
        console.error('❌ Erro fatal:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
