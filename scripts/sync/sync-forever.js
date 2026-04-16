/**
 * SGP ERUS — SYNC FOREVER  v7.1
 * Industrial Premium Terminal UI (emoji-safe)
 */

const { spawn } = require('child_process');
const path      = require('path');
const readline  = require('readline');
const fs        = require('fs');

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
const ROOT_DIR = path.join(__dirname, '..', '..');
const LOG_FILE = path.join(__dirname, 'sync-errors.log');
const W        = 66; // inner content width (ASCII-safe)

const SYNC_BATS = [
    { name: 'CUSTOS',      file: 'sincronizar_acustos.bat',      icon: '[$$]' },
    { name: 'DEVOLUCOES',  file: 'sincronizar_adevolucoes.bat',  icon: '[<<]' },
    { name: 'EMISSOES',    file: 'sincronizar_aemissoes.bat',    icon: '[>>]' },
    { name: 'FATURAMENTO', file: 'sincronizar_afaturamento.bat', icon: '[NF]' },
    { name: 'PEDIDOS',     file: 'sincronizar_apedidos.bat',     icon: '[PD]' },
    { name: 'PRODUCAO',    file: 'sincronizar_aproducao.bat',    icon: '[PR]' },
    { name: 'REFUGOS',     file: 'sincronizar_arefugo.bat',      icon: '[RF]' },
    { name: 'SNAPSHOTS',   file: 'sincronizar_asnapshots.bat',   icon: '[SS]' },
];

const DELAY_MS = 10000;
const getW = () => Math.max(80, (process.stdout.columns || 100)) - 4; // dynamic terminal width


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

// ─── BOX HELPERS ─────────────────────────────────────────────────────────────
const bdr = C.border;
const B = {
    tl: '╔', tr: '╗', bl: '╚', br: '╝',
    h:  '═', v:  '║',
    ml: '╠', mr: '╣',
    top: () => { const w = getW(); return bdr + B.tl + B.h.repeat(w) + B.tr + reset; },
    sep: () => { const w = getW(); return bdr + B.ml + B.h.repeat(w) + B.mr + reset; },
    bot: () => { const w = getW(); return bdr + B.bl + B.h.repeat(w) + B.br + reset; },
    row: (content, w) => { w = w || getW(); return bdr + B.v + reset + padR(content, w) + bdr + B.v + reset; },
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

    out.push(B.row(s1, W));
    out.push(B.row(s2, W));

    // ── MODULES ──────────────────────────────────────────────────────────────
    out.push(B.sep());
    out.push(B.row(centerStr(bold + C.gold + '>  MODULOS DE SINCRONIZACAO  <' + reset, W), W));
    out.push(B.sep());

    // Progress bar fills remaining space dynamically
    const FIXED = 4 + 1 + 12 + 3 + 4 + 2 + 8 + 2 + 10; // icon+name+brackets+pct+badge+ok
    const BAR = Math.max(20, W - FIXED);

    SYNC_BATS.forEach(bat => {
        const prog  = currentProg[bat.name] || 0;
        const state = scriptState[bat.name];

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
        const ok    = lastOkAt[bat.name] ? dim + ' ok ' + lastOkAt[bat.name] + reset : '';

        const row = ' ' + icon + ' ' + name + ' [' + bar + '] ' + pct + '  ' + badge + '  ' + ok;
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

        const child = spawn('cmd.exe', ['/c', bat.file], { cwd: ROOT_DIR, stdio: ['ignore','pipe','pipe'] });

        child.stdout.on('data', data => {
            data.toString().split('\n').forEach(line => {
                const l = line.trim();
                if (l.includes('@PROG:')) {
                    const parts = l.split(':');
                    if (parts.length >= 3) currentProg[parts[1]] = parseInt(parts[2]) || 0;
                } else if (l.includes('\u274C') || (l.toLowerCase().includes('error:') && !l.toLowerCase().includes('warning'))) {
                    logEvent(bat.name, l, true);
                }
            });
        });

        child.stderr.on('data', data => {
            const err = data.toString().trim();
            if (!err || err.includes('terminada') || err.includes('Warning:') || err.includes('SECURITY WARNING:')) return;
            logEvent(bat.name, err, true);
            scriptState[bat.name] = 'ERROR';
        });

        child.on('close', code => {
            if (code !== 0) {
                scriptState[bat.name] = 'ERROR';
                logEvent(bat.name, `Falha - codigo de saida ${code}`, true);
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

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function startForever() {
    console.clear();
    process.stdout.write('\x1B[?25l');

    if (!fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(LOG_FILE, `=== SGP ERUS SYNC LOG - ${new Date().toISOString()} ===\n`);
    }

    while (true) {
        cycleCount++;
        SYNC_BATS.forEach(b => { currentProg[b.name] = 0; scriptState[b.name] = 'IDLE'; });

        const cycleStart = Date.now();
        const timer = setInterval(() => drawDashboard(cycleStart), 800);

        for (let i = 0; i < SYNC_BATS.length; i++) {
            await runBat(SYNC_BATS[i]);
            if (i < SYNC_BATS.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
        }

        clearInterval(timer);
        const duration = (Date.now() - cycleStart) / 1000;
        cycleHistory.push(duration);
        if (cycleHistory.length > 50) cycleHistory.shift();

        logEvent('SISTEMA', `Ciclo #${cycleCount} concluido em ${duration.toFixed(1)}s`, false);
        drawDashboard(cycleStart);

        await new Promise(r => setTimeout(r, 30000));
    }
}

process.on('SIGINT', () => { process.stdout.write('\x1B[?25h'); process.exit(0); });
process.on('exit',   () => process.stdout.write('\x1B[?25h'));

startForever();
