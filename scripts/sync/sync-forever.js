/**
 * SGP ERUS — SYNC FOREVER  v7.1
 * Industrial Premium Terminal UI (emoji-safe)
 */

const { spawn } = require('child_process');
const path      = require('path');
const readline  = require('readline');
const fs        = require('fs');
const https     = require('https');

function updateSyncProgress(pageId, progress) {
    if (!pageId) return;
    const data = JSON.stringify({ page_id: pageId, progress });
    const req = https.request({
        hostname: 'fundicaoerus.vercel.app', port: 443,
        path: '/api/page-locks/sync-progress', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    });
    req.on('error', () => {});
    req.write(data);
    req.end();
}

require('dotenv').config({ path: path.join(__dirname, '../../.env.local'), override: true });

// ─── ANSI ────────────────────────────────────────────────────────────────────
const reset  = '\x1b[0m';
const bold   = '\x1b[1m';
const dim    = '\x1b[2m';
const rgb    = (r,g,b) => `\x1b[38;2;${r};${g};${b}m`;
const bgRgb  = (r,g,b) => `\x1b[48;2;${r};${g};${b}m`;

const C = {
    gold:   rgb(251,191,36),
    amber:  rgb(217,119,6),
    cyan:   rgb(34,211,238),
    green:  rgb(16,185,129),
    red:    rgb(239,68,68),
    orange: rgb(249,115,22),
    white:  rgb(244,244,245),
    muted:  rgb(113,113,122),
    border: rgb(63,63,70),
    dim:    rgb(82,82,91),
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
// Visual length — strips ANSI and counts emoji as 2 cols
function visLen(str) {
    const plain = str.replace(/\x1b\[[0-9;]*m/g, '');
    let len = 0;
    for (const ch of plain) {
        const cp = ch.codePointAt(0);
        // Emoji / fullwidth ranges
        if (cp >= 0x1F000 || (cp >= 0x2600 && cp <= 0x27BF) || (cp >= 0xFE00 && cp <= 0xFE0F)) {
            len += 2;
        } else {
            len += 1;
        }
    }
    return len;
}

function padR(str, len) {
    const diff = len - visLen(str);
    return str + (diff > 0 ? ' '.repeat(diff) : '');
}

function padL(str, len) {
    const diff = len - visLen(str);
    return (diff > 0 ? ' '.repeat(diff) : '') + str;
}

function centerStr(str, width) {
    const diff = width - visLen(str);
    if (diff <= 0) return str;
    const l = Math.floor(diff / 2);
    return ' '.repeat(l) + str + ' '.repeat(diff - l);
}

function gradient(text, from, to) {
    let out = '';
    const len = [...text].length || 1;
    let i = 0;
    for (const ch of text) {
        const t = i++ / len;
        out += rgb(
            Math.round(from[0] + (to[0]-from[0]) * t),
            Math.round(from[1] + (to[1]-from[1]) * t),
            Math.round(from[2] + (to[2]-from[2]) * t)
        ) + ch;
    }
    return out + reset;
}

function nowTime() {
    return new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const ROOT_DIR      = path.join(__dirname, '..', '..');
const LOG_FILE      = path.join(__dirname, 'sync-errors.log');
const CYCLE_LOG     = path.join(ROOT_DIR, 'sync-ciclos.txt');
const W        = 66; // inner content width (ASCII-safe)

const SYNC_BATS = [
    { name: 'CUSTOS',      file: path.join('sync', 'sincronizar_acustos.bat'),       icon: '[$$]', pageId: 'custos.html' },
    { name: 'BALANCO',     file: path.join('sync', 'sincronizar_balanco.bat'),        icon: '[BL]', pageId: 'balanco.html' },
    { name: 'DEVOLUCOES',  file: path.join('sync', 'sincronizar_adevolucoes.bat'),   icon: '[<<]', pageId: 'devolucoes.html' },
    { name: 'EMISSOES',    file: path.join('sync', 'sincronizar_aemissoes.bat'),     icon: '[>>]', pageId: 'pedidos.html' },
    { name: 'FATURAMENTO', file: path.join('sync', 'sincronizar_afaturamento.bat'),  icon: '[NF]', pageId: 'faturamentos.html' },
    { name: 'CLIENTES',    file: path.join('sync', 'sincronizar_aclientes.bat'),     icon: '[CL]', pageId: 'clientes.html' },
    { name: 'PEDIDOS',     file: path.join('sync', 'sincronizar_apedidos.bat'),      icon: '[PD]', pageId: 'pedidos.html' },
    { name: 'PRODUCAO',    file: path.join('sync', 'sincronizar_aproducao.bat'),     icon: '[PR]', pageId: 'pedidos.html' },
    { name: 'REFUGOS',     file: path.join('sync', 'sincronizar_arefugo.bat'),       icon: '[RF]', pageId: 'refugos.html' },
    { name: 'SNAPSHOTS',   file: path.join('sync', 'sincronizar_asnapshots.bat'),    icon: '[SS]', pageId: 'pedidos.html' },
    { name: 'VALOR USI',   file: path.join('sync', 'sincronizar_valorusinagem.bat'), icon: '[VU]', pageId: 'usinagem_externa.html' },
];

const MOLDAGEM_BAT  = { name: 'MOLDAGEM', file: path.join('sync', 'sincronizar_fichatecmoldagem.bat'), icon: '[ML]', pageId: 'fichatecmoldagem.html' };
const FUSAO_BAT     = { name: 'FUSAO FT',  file: path.join('sync', 'sincronizar_fichatecfusao.bat'),   icon: '[FU]', pageId: 'fichatecfusao.html' };
const MOLDAGEM_WAIT = 30 * 60 * 1000; // 30 minutos
let moldagemNextAt  = null;
let fusaoNextAt     = null;

const DELAY_MS = 2000;
const getW = () => Math.max(80, (process.stdout.columns || 120)) - 2; // dynamic terminal width


// ─── STATE ───────────────────────────────────────────────────────────────────
let cycleCount   = 0;
let cycleHistory = [];
let currentProg  = {};
let scriptState  = {};
let activeIssues = {};
let totalErrors  = 0;
let logHistory   = [];
let lastOkAt     = {};

SYNC_BATS.forEach(b => { currentProg[b.name] = 0; scriptState[b.name] = 'IDLE'; });
currentProg[MOLDAGEM_BAT.name] = 0;
scriptState[MOLDAGEM_BAT.name] = 'IDLE';
currentProg[FUSAO_BAT.name] = 0;
scriptState[FUSAO_BAT.name] = 'IDLE';

// ─── BOX HELPERS ─────────────────────────────────────────────────────────────
const bdr = C.border;
const B = {
    tl: '╔', tr: '╗', bl: '╚', br: '╝',
    h:  '═', v:  '║',
    ml: '╠', mr: '╣',
    top: () => { const w = getW(); return bdr + B.tl + B.h.repeat(w) + B.tr + reset; },
    sep: () => { const w = getW(); return bdr + B.ml + B.h.repeat(w) + B.mr + reset; },
    bot: () => { const w = getW(); return bdr + B.bl + B.h.repeat(w) + B.br + reset; },
    row: (content, w) => {
        w = w || getW();
        // Strip ANSI to measure, then pad or truncate to exactly w visual chars
        let vis = visLen(content);
        let out = content;
        if (vis < w) {
            out = content + ' '.repeat(w - vis);
        } else if (vis > w) {
            // truncate plain chars until fits
            let acc = 0, result = '';
            for (const ch of content.replace(/\x1b\[[0-9;]*m/g, '')) {
                const cw = ch.codePointAt(0) >= 0x1F000 ? 2 : 1;
                if (acc + cw > w) break;
                acc += cw; result += ch;
            }
            out = result + ' '.repeat(Math.max(0, w - acc));
        }
        return bdr + B.v + reset + out + reset + bdr + B.v + reset;
    },
    blank: () => { const w = getW(); return B.row(' '.repeat(w), w); },
};

// ─── DRAW ────────────────────────────────────────────────────────────────────
function drawDashboard(cycleStart) {
    const lines = buildFrame(cycleStart);
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
    process.stdout.write(lines.join('\n') + '\n');
}

function buildFrame(cycleStart) {
    const out = [];
    const W = getW(); // dynamic each frame
    const avgTime = cycleHistory.length > 0
        ? (cycleHistory.reduce((a,b)=>a+b,0)/cycleHistory.length).toFixed(1)
        : '--';
    const elapsed = cycleStart ? ((Date.now()-cycleStart)/1000).toFixed(1) : '--';

    // ── HEADER ───────────────────────────────────────────────────────────────
    out.push(B.top());
    const title = gradient('  FUNDICAO ERUS  -  SINCRONIZACAO EM TEMPO REAL  ', [251,191,36],[249,115,22]);
    out.push(B.row(centerStr(bold + title + reset, W), W));
    const sub = dim + 'Sistema de Gestao de Producao  *  SGP v7.1' + reset;
    out.push(B.row(centerStr(sub, W), W));

    // ── STATS ────────────────────────────────────────────────────────────────
    out.push(B.sep());
    const cycleV = bold + C.gold  + '#' + String(cycleCount).padStart(3,'0') + reset;
    const avgV   = bold + C.cyan  + avgTime + 's' + reset;
    const errV   = totalErrors > 0
        ? bold + C.red   + String(totalErrors).padStart(4,'0') + reset
        : bold + C.green + '0000' + reset;
    const elapsV = bold + C.amber + elapsed + 's' + reset;
    const timeV  = bold + C.white + nowTime() + reset;

    const s1 = '  ' + C.muted+'CICLO '+reset + cycleV +
               '    ' + C.muted+'MEDIA '+reset + avgV +
               '    ' + C.muted+'ERROS '+reset + errV +
               '    ' + C.muted+'TEMPO '+reset + elapsV;
    const s2 = '  ' + C.muted+'HORA  '+reset + timeV +
               '    ' + C.dim+'LOG  scripts/sync/sync-errors.log'+reset;
    const s3 = '  ' + C.muted+'HORARIO COMERCIAL  '+reset + bold + C.green + 'Seg-Sex  06:30 - 18:00' + reset;

    out.push(B.row(s1, W));
    out.push(B.row(s2, W));
    out.push(B.row(s3, W));

    // ── MODULES ──────────────────────────────────────────────────────────────
    out.push(B.sep());
    out.push(B.row(centerStr(bold + C.gold + '>  MODULOS DE SINCRONIZACAO  <' + reset, W), W));
    out.push(B.sep());

    // Layout: ' '[1] icon[4] ' '[1] name[11] ' ['[2] BAR '] '[2] pct[4] '  '[2] '[badge]'[10] '  ok '[5] time[8]
    // Total fixed = 50. BAR = W - 50, minus 2 extra safety margin
    const FIXED = 1 + 4 + 1 + 11 + 2 + 2 + 4 + 2 + 10 + 5 + 8; // = 50
    const BAR = Math.max(10, W - FIXED - 2);

    [...SYNC_BATS, MOLDAGEM_BAT, FUSAO_BAT].forEach(bat => {
        const prog  = currentProg[bat.name] || 0;
        const state = scriptState[bat.name];

        // Countdown para loops independentes aguardando pr\u00f3ximo ciclo
        let countdownStr = '';
        const nextAtMap = { 'MOLDAGEM': moldagemNextAt, 'FUSAO FT': fusaoNextAt };
        if (nextAtMap[bat.name] && state === 'IDLE') {
            const secsLeft = Math.max(0, Math.round((nextAtMap[bat.name] - Date.now()) / 1000));
            if (secsLeft > 0) {
                const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
                const ss = String(secsLeft % 60).padStart(2, '0');
                countdownStr = C.amber + ' ' + mm + ':' + ss + reset;
            }
        }

        let stateColor, stateLabel;
        switch (state) {
            case 'RUNNING': stateColor = C.cyan;  stateLabel = ' RODANDO'; break;
            case 'DONE':    stateColor = C.green; stateLabel = '  PRONTO'; break;
            case 'ERROR':   stateColor = C.red;   stateLabel = '    ERRO'; break;
            default:        stateColor = C.muted; stateLabel = '  AGUARD'; break;
        }

        const filled = Math.round((prog / 100) * BAR);
        let bar = '';
        for (let i = 0; i < filled; i++) {
            const t = i / BAR;
            bar += rgb(Math.round(16+t*235), Math.round(185-t*50), Math.round(129-t*80)) + '\u2588';
        }
        bar += C.dim + '\u2591'.repeat(BAR - filled) + reset;

        const icon  = C.muted + bat.icon + reset;
        const name  = bold + stateColor + padR(bat.name, 11) + reset;
        const pct   = bold + stateColor + padL(prog + '%', 4) + reset;
        const badge = stateColor + bold + '[' + stateLabel + ']' + reset;
        const ok    = lastOkAt[bat.name] ? dim + '  ok ' + lastOkAt[bat.name] + reset : '         ';

        const row = ' ' + icon + ' ' + name + ' [' + bar + '] ' + pct + '  ' + badge + '  ' + ok + countdownStr;
        out.push(B.row(row, W));
    });

    // ── ALERTS ───────────────────────────────────────────────────────────────
    out.push(B.sep());
    const issues = Object.entries(activeIssues);
    if (issues.length > 0) {
        out.push(B.row(centerStr(bold + C.red + '!  ALERTAS ATIVOS  !' + reset, W), W));
        issues.slice(0, 3).forEach(([script, msg]) => {
            const line = '  ' + C.red + '> ' + bold + padR(script, 11) + reset + ' ' + C.orange + msg.substring(0, W - 20) + reset;
            out.push(B.row(line, W));
        });
    } else {
        out.push(B.row(centerStr(bold + C.green + '+  TODOS OS MODULOS OPERACIONAIS  +' + reset, W), W));
    }

    // ── LOG ──────────────────────────────────────────────────────────────────
    out.push(B.sep());
    out.push(B.row(centerStr(C.muted + 'o  HISTORICO DE EVENTOS  o' + reset, W), W));

    const lastLogs = [...logHistory.slice(-6)];
    while (lastLogs.length < 6) lastLogs.unshift(null);
    lastLogs.forEach(e => {
        if (!e) { out.push(B.blank()); return; }
        const t   = C.dim + '[' + e.time + ']' + reset;
        const sc  = e.isError ? C.red + bold + padR(e.script, 12) + reset : C.green + dim + padR(e.script, 12) + reset;
        const msg = (e.isError ? C.orange : C.dim) + e.msg.substring(0, W - 35) + reset;
        out.push(B.row('  ' + t + ' ' + sc + ' | ' + msg, W));
    });

    // ── FOOTER ───────────────────────────────────────────────────────────────
    out.push(B.sep());
    out.push(B.row(centerStr(dim + 'Pressione  Ctrl+C  para encerrar  *  Atualizacao a cada 800ms' + reset, W), W));
    out.push(B.bot());

    return out;
}

// ─── LOGGING ─────────────────────────────────────────────────────────────────
function logEvent(script, message, isError = true) {
    const ts  = new Date().toISOString().replace('T',' ').substring(0,19);
    const msg = message.trim();
    if (!msg || msg.includes('@PROG')) return;
    if (!isError && (msg.includes('SECURITY WARNING') || msg.includes('Warning:') || msg.includes('adopt standard'))) return;

    if (isError) { totalErrors++; activeIssues[script] = msg; }
    try { fs.appendFileSync(LOG_FILE, `[${ts}] [${script}] ${isError?'ERROR':'INFO'}: ${msg}\n`); } catch(e) {}
    logHistory.push({ time: nowTime(), script, msg, isError });
    if (logHistory.length > 60) logHistory.shift();
}

// ─── RUN BAT ─────────────────────────────────────────────────────────────────
function runBat(bat) {
    return new Promise(resolve => {
        scriptState[bat.name] = 'RUNNING';
        currentProg[bat.name] = 0;

        const child = spawn('cmd.exe', ['/c', path.join(ROOT_DIR, bat.file)], { stdio: ['ignore','pipe','pipe'] });

        // hadFatal: como o .bat sempre sai com codigo 0 (por causa do unlock final), o exit code
        // nao indica falha do modulo. Detectamos falha real pelos marcadores fatais no output.
        // Sem watchdog de tempo: modulos podem levar o tempo que precisarem (ex.: PEDIDOS ~10 min).
        let hadFatal = false;

        child.stdout.on('data', data => {
            data.toString().split('\n').forEach(line => {
                const l = line.trim();
                if (l.includes('@PROG:')) {
                    const parts = l.split(':');
                    if (parts.length >= 3) {
                        currentProg[parts[1]] = parseInt(parts[2]) || 0;
                        updateSyncProgress(bat.pageId, currentProg[parts[1]]);
                    }
                } else if (l.includes('Falha definitiva')) {
                    // Só conta erro após esgotar todas as tentativas do firebird-helper
                    hadFatal = true;
                    logEvent(bat.name, l, true);
                } else if (l.includes('Login falhou') || l.includes('tentativa')) {
                    // Tentativa intermediária — só exibe no log, não conta como erro
                    logEvent(bat.name, l, false);
                } else if (l.includes('\u274C') || (l.toLowerCase().includes('error:') && !l.toLowerCase().includes('warning'))) {
                    hadFatal = true;
                    logEvent(bat.name, l, true);
                }
            });
        });

        child.stderr.on('data', data => {
            const err = data.toString().trim();
            if (!err || err.includes('terminada') || err.includes('Warning:') || err.includes('SECURITY WARNING:')) return;
            // Tentativas de reconexão do Firebird não são erros definitivos
            if (err.includes('Login falhou') || err.includes('tentativa')) {
                logEvent(bat.name, err, false);
                return;
            }
            // Qualquer stderr restante (já filtrados warnings e tentativas) é falha real
            hadFatal = true;
            logEvent(bat.name, err, true);
        });

        child.on('close', code => {
            if (hadFatal || code !== 0) {
                scriptState[bat.name] = 'ERROR';
                if (code !== 0) logEvent(bat.name, `Falha - codigo de saida ${code}`, true);
            } else {
                scriptState[bat.name] = 'DONE';
                currentProg[bat.name] = 100;
                lastOkAt[bat.name]    = nowTime();
                delete activeIssues[bat.name];
                logEvent(bat.name, 'Sincronizacao concluida com sucesso', false);
            }
            resolve();
        });
    });
}

// ─── SCHEDULE ────────────────────────────────────────────────────────────────
function isWithinSchedule() {
    const now = new Date();
    const day = now.getDay(); // 0=Dom, 1=Seg ... 5=Sex, 6=Sab
    if (day === 0 || day === 6) return false;
    const minutes = now.getHours() * 60 + now.getMinutes();
    return minutes >= 6 * 60 + 30 && minutes < 18 * 60;
}

function drawOffSchedule() {
    const W = getW();
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
    const lines = [];
    lines.push(B.top());
    lines.push(B.row(centerStr(bold + gradient('  FUNDICAO ERUS  -  SINCRONIZACAO EM TEMPO REAL  ', [251,191,36],[249,115,22]) + reset, W), W));
    lines.push(B.sep());
    lines.push(B.row(centerStr(bold + C.amber + 'SINCRONIZACAO PAUSADA - FORA DO HORARIO' + reset, W), W));
    lines.push(B.row(centerStr(C.muted + 'Segunda a Sexta  |  06:30 - 18:00' + reset, W), W));
    lines.push(B.row(centerStr(C.white + 'Hora atual: ' + bold + nowTime() + reset, W), W));
    lines.push(B.sep());
    lines.push(B.row(centerStr(dim + 'Aguardando proximo horario comercial...' + reset, W), W));
    lines.push(B.bot());
    process.stdout.write(lines.join('\n') + '\n');
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function startForever() {
    console.clear();
    process.stdout.write('\x1B[?25l');

    if (!fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(LOG_FILE, `=== SGP ERUS SYNC LOG - ${new Date().toISOString()} ===\n`);
    }
    if (!fs.existsSync(CYCLE_LOG)) {
        const now = new Date();
        const fmtNow = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');
        fs.writeFileSync(CYCLE_LOG, `=== SGP ERUS - HISTORICO DE CICLOS - ${fmtNow} ===\n`);
    }

    while (true) {
        if (!isWithinSchedule()) {
            drawOffSchedule();
            await new Promise(r => setTimeout(r, 60000));
            continue;
        }

        cycleCount++;
        SYNC_BATS.forEach(b => { currentProg[b.name] = 0; scriptState[b.name] = 'IDLE'; });

        const cycleStart = Date.now();
        const timer = setInterval(() => drawDashboard(cycleStart), 800);

        for (let i = 0; i < SYNC_BATS.length; i++) {
            await runBat(SYNC_BATS[i]);
            if (i < SYNC_BATS.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
        }

        clearInterval(timer);
        const cycleEnd = new Date();
        const duration = (Date.now() - cycleStart) / 1000;
        cycleHistory.push(duration);
        if (cycleHistory.length > 50) cycleHistory.shift();

        const cycleStartDate = new Date(cycleStart);
        const fmtDate = d => d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR');
        const cycleLogLine = `Ciclo #${String(cycleCount).padStart(3,'0')} | Inicio: ${fmtDate(cycleStartDate)} | Fim: ${fmtDate(cycleEnd)} | Duracao: ${duration.toFixed(1)}s\n`;
        try { fs.appendFileSync(CYCLE_LOG, cycleLogLine); } catch(e) {}

        logEvent('SISTEMA', `Ciclo #${cycleCount} concluido em ${duration.toFixed(1)}s`, false);
        drawDashboard(cycleStart);

        await new Promise(r => setTimeout(r, 30000));
    }
}

// ─── LOOP INDEPENDENTE FUSAO ─────────────────────────────────────────────────
async function startFusaoLoop() {
    while (true) {
        if (!isWithinSchedule()) {
            await new Promise(r => setTimeout(r, 60000));
            continue;
        }

        fusaoNextAt = null;
        await runBat(FUSAO_BAT);

        const fmtDate = d => d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR');
        const line = `[FUSAO FT] Fim: ${fmtDate(new Date())}\n`;
        try { fs.appendFileSync(CYCLE_LOG, line); } catch(e) {}
        logEvent('FUSAO FT', `Ciclo concluido`, false);

        fusaoNextAt = Date.now() + MOLDAGEM_WAIT;
        scriptState[FUSAO_BAT.name] = 'IDLE';
        await new Promise(r => setTimeout(r, MOLDAGEM_WAIT));
        fusaoNextAt = null;
    }
}

// ─── LOOP INDEPENDENTE MOLDAGEM ──────────────────────────────────────────────
async function startMoldagemLoop() {
    while (true) {
        if (!isWithinSchedule()) {
            await new Promise(r => setTimeout(r, 60000));
            continue;
        }

        const moldStart = Date.now();
        moldagemNextAt  = null;
        await runBat(MOLDAGEM_BAT);

        const moldDuration = (Date.now() - moldStart) / 1000;
        const moldStartDate = new Date(moldStart);
        const fmtDate = d => d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR');
        const moldLogLine = `[MOLDAGEM] Inicio: ${fmtDate(moldStartDate)} | Fim: ${fmtDate(new Date())} | Duracao: ${moldDuration.toFixed(1)}s\n`;
        try { fs.appendFileSync(CYCLE_LOG, moldLogLine); } catch(e) {}
        logEvent('MOLDAGEM', `Ciclo concluido em ${moldDuration.toFixed(1)}s`, false);

        // Aguardar 30 minutos com countdown visível
        moldagemNextAt = Date.now() + MOLDAGEM_WAIT;
        scriptState[MOLDAGEM_BAT.name] = 'IDLE';
        await new Promise(r => setTimeout(r, MOLDAGEM_WAIT));
        moldagemNextAt = null;
    }
}

process.on('SIGINT', () => { process.stdout.write('\x1B[?25h'); process.exit(0); });
process.on('exit',   () => process.stdout.write('\x1B[?25h'));

startMoldagemLoop();
startFusaoLoop();
startForever();
