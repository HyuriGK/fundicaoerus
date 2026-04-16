/**
 * SGP ERUS — SYNC FOREVER  v7.0
 * Design: Industrial Premium Terminal UI
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const fs = require('fs');

// ─── ANSI ────────────────────────────────────────────────────────────────────
const ESC  = '\x1b[';
const reset  = '\x1b[0m';
const bold   = '\x1b[1m';
const dim    = '\x1b[2m';

const rgb   = (r,g,b) => `\x1b[38;2;${r};${g};${b}m`;
const bgRgb = (r,g,b) => `\x1b[48;2;${r};${g};${b}m`;

const C = {
    gold:    rgb(251,191,36),
    amber:   rgb(217,119,6),
    cyan:    rgb(34,211,238),
    blue:    rgb(59,130,246),
    green:   rgb(16,185,129),
    red:     rgb(239,68,68),
    orange:  rgb(249,115,22),
    white:   rgb(244,244,245),
    muted:   rgb(113,113,122),
    border:  rgb(63,63,70),
    bg:      bgRgb(9,9,11),
    bgCard:  bgRgb(24,24,27),
    bgRun:   bgRgb(20,40,20),
    bgErr:   bgRgb(40,10,10),
    bgDone:  bgRgb(10,30,20),
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const cur = (x,y) => `${ESC}${y};${x}H`;
const clearLine = () => `${ESC}2K`;
const hideCursor = () => process.stdout.write('\x1B[?25l');
const showCursor = () => process.stdout.write('\x1B[?25h');

function pad(str, len, dir = 'right') {
    const s = String(str);
    const plain = s.replace(/\x1b\[[0-9;]*m/g, '');
    const diff = len - plain.length;
    if (diff <= 0) return s;
    return dir === 'right' ? s + ' '.repeat(diff) : ' '.repeat(diff) + s;
}

function center(str, width) {
    const plain = str.replace(/\x1b\[[0-9;]*m/g, '');
    const space = width - plain.length;
    if (space <= 0) return str;
    const l = Math.floor(space / 2);
    return ' '.repeat(l) + str + ' '.repeat(space - l);
}

function now() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function gradient(text, from, to) {
    let out = '';
    const len = text.length || 1;
    for (let i = 0; i < text.length; i++) {
        const t = i / len;
        const r = Math.round(from[0] + (to[0] - from[0]) * t);
        const g = Math.round(from[1] + (to[1] - from[1]) * t);
        const b = Math.round(from[2] + (to[2] - from[2]) * t);
        out += rgb(r, g, b) + text[i];
    }
    return out + reset;
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const ROOT_DIR = path.join(__dirname, '..', '..');
const LOG_FILE = path.join(__dirname, 'sync-errors.log');

const SYNC_BATS = [
    { name: 'CUSTOS',      file: 'sincronizar_acustos.bat',      icon: '💰' },
    { name: 'DEVOLUÇÕES',  file: 'sincronizar_adevolucoes.bat',  icon: '↩️ ' },
    { name: 'EMISSÕES',    file: 'sincronizar_aemissoes.bat',     icon: '📤' },
    { name: 'FATURAMENTO', file: 'sincronizar_afaturamento.bat', icon: '🧾' },
    { name: 'PEDIDOS',     file: 'sincronizar_apedidos.bat',     icon: '📦' },
    { name: 'PRODUÇÃO',    file: 'sincronizar_aproducao.bat',    icon: '🏭' },
    { name: 'REFUGOS',     file: 'sincronizar_arefugo.bat',      icon: '♻️ ' },
    { name: 'SNAPSHOTS',   file: 'sincronizar_asnapshots.bat',   icon: '📸' },
];

const DELAY_MS = 10000;
const W = 72; // total box width (inner)

// ─── STATE ───────────────────────────────────────────────────────────────────
let cycleCount    = 0;
let cycleHistory  = [];
let currentProg   = {};
let scriptState   = {};
let activeIssues  = {};
let totalErrors   = 0;
let logHistory    = [];
let lastSuccessAt = {};

SYNC_BATS.forEach(b => {
    currentProg[b.name]  = 0;
    scriptState[b.name]  = 'IDLE';
});

// ─── DRAW ────────────────────────────────────────────────────────────────────
function drawDashboard(cycleStart) {
    const lines = buildFrame(cycleStart);
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
    process.stdout.write(lines.join('\n') + '\n');
}

function buildFrame(cycleStart) {
    const out = [];
    const W2 = W + 2; // with borders

    const avgTime = cycleHistory.length > 0
        ? (cycleHistory.reduce((a,b)=>a+b,0)/cycleHistory.length).toFixed(1)
        : '—';
    const elapsed = cycleStart ? ((Date.now()-cycleStart)/1000).toFixed(1)+'s' : '—';

    // ── TOP BAR ──────────────────────────────────────────────────────────────
    out.push(C.border + '╔' + '═'.repeat(W2) + '╗' + reset);

    // Title row
    const titleText = '  ◈  FUNDIÇÃO ERUS  —  SINCRONIZAÇÃO EM TEMPO REAL  ◈  ';
    out.push(
        C.border + '║' + reset +
        bold + gradient(center(titleText, W2), [251,191,36], [249,115,22]) +
        C.border + '║' + reset
    );

    // Subtitle
    const sub = center(dim + 'Sistema de Gestão de Produção  •  SGP v7.0' + reset, W2 + 20);
    out.push(C.border + '║' + reset + sub + C.border + '║' + reset);

    out.push(C.border + '╠' + '═'.repeat(Math.floor(W2/2)) + '╦' + '═'.repeat(W2 - Math.floor(W2/2) - 1) + '╣' + reset);

    // Stats row 1
    const cycleStr  = bold + C.gold + '#' + String(cycleCount).padStart(3,'0') + reset;
    const avgStr    = bold + C.cyan + avgTime + 's' + reset;
    const errStr    = totalErrors > 0
        ? bold + C.red   + String(totalErrors).padStart(4,'0') + reset
        : bold + C.green + '0000' + reset;
    const elapsStr  = bold + C.amber + elapsed + reset;

    const left1  = '  ' + C.muted + 'CICLO ' + reset + cycleStr + '   ' + C.muted + 'MÉDIA ' + reset + avgStr;
    const right1 = C.muted + 'ERROS ' + reset + errStr + '   ' + C.muted + 'TEMPO ' + reset + elapsStr + '  ';

    out.push(
        C.border + '║' + reset +
        pad(left1,  Math.floor(W2/2) + 12) +
        C.border + '║' + reset +
        pad(right1, W2 - Math.floor(W2/2) + 12) +
        C.border + '║' + reset
    );

    // Stats row 2
    const timeStr   = C.muted + 'HORA  ' + reset + bold + C.white + now() + reset;
    const logStr    = C.muted + 'LOG   ' + reset + dim + 'scripts/sync/sync-errors.log' + reset;
    const left2  = '  ' + timeStr;
    const right2 = logStr + '  ';
    out.push(
        C.border + '║' + reset +
        pad(left2,  Math.floor(W2/2) + 8) +
        C.border + '║' + reset +
        pad(right2, W2 - Math.floor(W2/2) + 18) +
        C.border + '║' + reset
    );

    // ── SECTION: MÓDULOS ─────────────────────────────────────────────────────
    out.push(C.border + '╠' + '═'.repeat(W2) + '╣' + reset);

    const secTitle = center(bold + C.gold + '▸  MÓDULOS DE SINCRONIZAÇÃO  ◂' + reset, W2 + 20);
    out.push(C.border + '║' + reset + secTitle + C.border + '║' + reset);
    out.push(C.border + '╠' + '═'.repeat(W2) + '╣' + reset);

    SYNC_BATS.forEach(bat => {
        const prog  = currentProg[bat.name] || 0;
        const state = scriptState[bat.name];

        let stateLabel, stateColor, rowBg;
        if (state === 'RUNNING') {
            stateLabel = ' RODANDO '; stateColor = C.cyan;  rowBg = '';
        } else if (state === 'DONE') {
            stateLabel = '  PRONTO '; stateColor = C.green; rowBg = '';
        } else if (state === 'ERROR') {
            stateLabel = '   ERRO  '; stateColor = C.red;   rowBg = '';
        } else {
            stateLabel = '  AGUARD '; stateColor = C.muted; rowBg = '';
        }

        // Progress bar (30 chars)
        const BAR = 28;
        const filled = Math.round((prog / 100) * BAR);
        let bar = '';
        for (let i = 0; i < filled; i++) {
            const t = i / BAR;
            bar += rgb(Math.round(16+t*235), Math.round(185-t*50), Math.round(129-t*100)) + '█';
        }
        bar += C.border + '░'.repeat(BAR - filled) + reset;

        const pct  = bold + stateColor + String(prog).padStart(3) + '%' + reset;
        const name = bold + stateColor + pad(bat.name, 13) + reset;
        const badge = bgRgb(30,30,35) + stateColor + bold + stateLabel + reset;
        const last  = lastSuccessAt[bat.name]
            ? dim + ' ok ' + lastSuccessAt[bat.name] + reset
            : dim + '         ' + reset;

        const row = ' ' + bat.icon + ' ' + name + ' [' + bar + '] ' + pct + '  ' + badge + ' ' + last;
        out.push(C.border + '║' + reset + rowBg + pad(row, W2 + 60) + reset + C.border + '║' + reset);
    });

    // ── SECTION: ALERTAS ─────────────────────────────────────────────────────
    const issues = Object.entries(activeIssues);
    out.push(C.border + '╠' + '═'.repeat(W2) + '╣' + reset);

    if (issues.length > 0) {
        const alertTitle = center(bold + C.red + '⚠  ALERTAS ATIVOS  ⚠' + reset, W2 + 20);
        out.push(C.border + '║' + reset + alertTitle + C.border + '║' + reset);
        issues.slice(0, 3).forEach(([script, msg]) => {
            const line = '  ' + C.red + '▸ ' + bold + pad(script,12) + reset + C.orange + msg.substring(0, W - 20) + reset;
            out.push(C.border + '║' + reset + pad(line, W2 + 30) + C.border + '║' + reset);
        });
    } else {
        const okTitle = center(bold + C.green + '✔  TODOS OS MÓDULOS OPERACIONAIS  ✔' + reset, W2 + 20);
        out.push(C.border + '║' + reset + okTitle + C.border + '║' + reset);
    }

    // ── SECTION: LOG ─────────────────────────────────────────────────────────
    out.push(C.border + '╠' + '═'.repeat(W2) + '╣' + reset);
    const logTitle = center(bold + C.muted + '○  HISTÓRICO DE EVENTOS  ○' + reset, W2 + 20);
    out.push(C.border + '║' + reset + logTitle + C.border + '║' + reset);

    const lastLogs = logHistory.slice(-6);
    // pad to always show 6 lines
    while (lastLogs.length < 6) lastLogs.unshift(null);

    lastLogs.forEach(entry => {
        if (!entry) {
            out.push(C.border + '║' + reset + ' '.repeat(W2) + C.border + '║' + reset);
            return;
        }
        const timeStr   = C.border + '[' + reset + dim + entry.time + reset + C.border + ']' + reset;
        const scriptStr = entry.isError ? C.red + bold + pad(entry.script, 13) : C.green + dim + pad(entry.script, 13);
        const sep       = reset + C.border + '│' + reset + ' ';
        const msgColor  = entry.isError ? C.orange : dim;
        const msgStr    = msgColor + entry.msg.substring(0, W - 28) + reset;
        const line      = '  ' + timeStr + ' ' + scriptStr + reset + sep + msgStr;
        out.push(C.border + '║' + reset + pad(line, W2 + 60) + C.border + '║' + reset);
    });

    // ── BOTTOM ───────────────────────────────────────────────────────────────
    out.push(C.border + '╠' + '═'.repeat(W2) + '╣' + reset);
    const footer = center(dim + 'Pressione  Ctrl+C  para encerrar  •  Dados atualizados a cada ciclo' + reset, W2 + 10);
    out.push(C.border + '║' + reset + footer + C.border + '║' + reset);
    out.push(C.border + '╚' + '═'.repeat(W2) + '╝' + reset);

    return out;
}

// ─── LOGGING ─────────────────────────────────────────────────────────────────
function logEvent(script, message, isError = true) {
    const ts  = new Date().toISOString().replace('T',' ').substring(0,19);
    const msg = message.trim();
    if (!msg || msg.includes('@PROG')) return;

    const isSpam = msg.includes('SECURITY WARNING') || msg.includes('Warning:') || msg.includes('adopt standard');
    if (isSpam && !isError) return;

    if (isError) {
        totalErrors++;
        activeIssues[script] = msg;
    }

    try { fs.appendFileSync(LOG_FILE, `[${ts}] [${script}] ${isError?'ERROR':'INFO'}: ${msg}\n`); } catch(e){}

    logHistory.push({ time: now(), script, msg, isError });
    if (logHistory.length > 60) logHistory.shift();
}

// ─── RUN BAT ─────────────────────────────────────────────────────────────────
function runBat(bat) {
    return new Promise(resolve => {
        scriptState[bat.name]  = 'RUNNING';
        currentProg[bat.name]  = 0;

        const child = spawn('cmd.exe', ['/c', bat.file], {
            cwd: ROOT_DIR,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        child.stdout.on('data', data => {
            data.toString().split('\n').forEach(line => {
                const l = line.trim();
                if (l.includes('@PROG:')) {
                    const parts = l.split(':');
                    if (parts.length >= 3) {
                        const pct = parseInt(parts[2]) || 0;
                        currentProg[parts[1]] = pct;
                    }
                } else if (l.includes('❌') || (l.toLowerCase().includes('error:') && !l.toLowerCase().includes('warning'))) {
                    logEvent(bat.name, l, true);
                }
            });
        });

        child.stderr.on('data', data => {
            const err = data.toString().trim();
            if (!err || err.includes('terminada')) return;
            if (err.includes('Warning:') || err.includes('SECURITY WARNING:')) return;
            logEvent(bat.name, err, true);
            scriptState[bat.name] = 'ERROR';
        });

        child.on('close', code => {
            if (code !== 0) {
                scriptState[bat.name] = 'ERROR';
                logEvent(bat.name, `Falha — código de saída ${code}`, true);
            } else {
                scriptState[bat.name]  = 'DONE';
                currentProg[bat.name]  = 100;
                lastSuccessAt[bat.name] = now();
                delete activeIssues[bat.name];
                logEvent(bat.name, 'Sincronização concluída com sucesso', false);
            }
            resolve();
        });
    });
}

// ─── MAIN LOOP ───────────────────────────────────────────────────────────────
async function startForever() {
    console.clear();
    hideCursor();

    if (!fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(LOG_FILE, `=== SGP ERUS SYNC LOG — iniciado em ${new Date().toISOString()} ===\n`);
    }

    while (true) {
        cycleCount++;
        SYNC_BATS.forEach(b => {
            currentProg[b.name] = 0;
            scriptState[b.name] = 'IDLE';
        });

        const cycleStart = Date.now();
        const timer = setInterval(() => drawDashboard(cycleStart), 800);

        for (let i = 0; i < SYNC_BATS.length; i++) {
            await runBat(SYNC_BATS[i]);
            if (i < SYNC_BATS.length - 1) {
                await new Promise(r => setTimeout(r, DELAY_MS));
            }
        }

        clearInterval(timer);
        const duration = (Date.now() - cycleStart) / 1000;
        cycleHistory.push(duration);
        if (cycleHistory.length > 50) cycleHistory.shift();

        logEvent('SISTEMA', `Ciclo #${cycleCount} concluído em ${duration.toFixed(1)}s`, false);
        drawDashboard(cycleStart);

        // Aguarda 30s antes do próximo ciclo
        await new Promise(r => setTimeout(r, 30000));
    }
}

process.on('SIGINT', () => { showCursor(); process.exit(0); });
process.on('exit',   () => showCursor());

startForever();
