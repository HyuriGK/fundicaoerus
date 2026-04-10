/**
 * MASTER SYNC FOREVER V6 (Scrolling Log + Pinned Dashboard)
 * Orchestrates 6 batch files with a static top status board and 
 * an infinite scrolling log below it.
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const fs = require('fs');

// --- ANSI TRUECOLOR UTILS ---
const reset = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const italic = '\x1b[3m';

const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const bgRgb = (r, g, b) => `\x1b[48;2;${r};${g};${b}m`;

const color = {
    primary: rgb(0, 191, 255), // DeepSkyBlue
    secondary: rgb(0, 255, 255), // Cyan
    success: rgb(0, 200, 83),  // Green
    warning: rgb(255, 193, 7),  // Amber
    danger: rgb(255, 82, 82),   // Red
    info: rgb(33, 150, 243),    // Blue
    muted: rgb(117, 117, 117),  // Gray
    white: rgb(255, 255, 255)
};

// Gradient Generator
function getGradient(text, start, end) {
    let result = '';
    const len = text.length;
    for (let i = 0; i < len; i++) {
        const r = Math.floor(start[0] + (end[0] - start[0]) * (i / len));
        const g = Math.floor(start[1] + (end[1] - start[1]) * (i / len));
        const b = Math.floor(start[2] + (end[2] - start[2]) * (i / len));
        result += rgb(r, g, b) + text[i];
    }
    return result + reset;
}

// CONFIGURATIONS
const ROOT_DIR = path.join(__dirname, '..');
const LOG_FILE = path.join(ROOT_DIR, 'sync-errors.log');
const SYNC_BATS = [
    { name: 'CUSTOS', file: 'sincronizar_acustos.bat' },
    { name: 'DEVOLUÇÕES', file: 'sincronizar_adevolucoes.bat' },
    { name: 'EMISSÕES', file: 'sincronizar_aemissoes.bat' },
    { name: 'FATURAMENTO', file: 'sincronizar_afaturamento.bat' },
    { name: 'PEDIDOS', file: 'sincronizar_apedidos.bat' },
    { name: 'PRODUÇÃO', file: 'sincronizar_aproducao.bat' },
    { name: 'REFUGOS', file: 'sincronizar_arefugo.bat' },
    { name: 'SNAPSHOTS', file: 'sincronizar_asnapshots.bat' }
];
const DELAY_BETWEEN_SCRIPTS = 10000; // 10 segundos

// STATE
let cycleCount = 0;
let cycleHistory = []; 
let currentStatus = {};
let scriptState = {}; // 'IDLE', 'RUNNING', 'DONE', 'ERROR'
let activeIssues = {}; // Store current error per script
let totalErrorsCount = 0;
let logHistory = []; // Last 10 lines of actual events

SYNC_BATS.forEach(b => {
    currentStatus[b.name] = '0%';
    scriptState[b.name] = 'IDLE';
});

/**
 * Pinned Header Drawing (always at the top of the terminal viewport)
 */
function drawPinnedDashboard(startTime = null) {
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);

    const avgTime = cycleHistory.length > 0 
        ? (cycleHistory.reduce((a, b) => a + b, 0) / cycleHistory.length).toFixed(1) 
        : '--';

    // HEADER
    const title = '  📊 SGP ERUS - DASHBOARD DE SINCRONIZAÇÃO INDUSTRIAL  ';
    const headerLine = '═'.repeat(70);
    console.log(getGradient('╔' + '═'.repeat(68) + '╗', [0, 120, 255], [0, 255, 255]));
    console.log(getGradient('║', [0, 120, 255], [0, 120, 255]) + 
                bold + getGradient(title.center(68), [0, 215, 255], [0, 255, 200]) + 
                getGradient('║', [0, 255, 255], [0, 255, 255]));
    console.log(getGradient('╠' + '═'.repeat(34) + '╦' + '═'.repeat(33) + '╣', [0, 180, 255], [0, 240, 255]));

    // INFO ROW
    const col1 = `  🔄 CICLO: ${bold}#${cycleCount.toString().padStart(3, '0')}${reset}`.padEnd(41);
    const col2 = `⏱️ MÉDIA: ${bold}${avgTime}s${reset}`.padEnd(38);
    console.log(color.primary + '║' + col1 + color.primary + '║' + col2 + color.primary + '║' + reset);
    
    const errCountStr = totalErrorsCount > 0 ? (color.danger + totalErrorsCount.toString().padStart(4, '0') + reset) : (color.success + '0000' + reset);
    const col3 = `  🚩 ERROS TOTAIS: ${errCountStr}`.padEnd(50);
    const col4 = `📂 LOG: ${dim}sync-errors.log${reset}`.padEnd(46);
    console.log(color.primary + '║' + col3 + color.primary + '║' + col4 + color.primary + '║' + reset);
    
    console.log(getGradient('╠' + '═'.repeat(68) + '╣', [0, 215, 255], [0, 255, 220]));

    // SCRIPT STATUS TABLE
    SYNC_BATS.forEach(bat => {
        const progValue = parseInt(currentStatus[bat.name]) || 0;
        const state = scriptState[bat.name];
        
        let icon = '❄️ ';
        let stateColor = color.muted;
        if (state === 'RUNNING') { icon = '🚀 '; stateColor = color.secondary; }
        else if (state === 'DONE') { icon = '✅ '; stateColor = color.success; }
        else if (state === 'ERROR') { icon = '⚠️ '; stateColor = color.danger; }

        const barWidth = 24;
        const filled = Math.floor((progValue / 100) * barWidth);
        const empty = barWidth - filled;
        
        // Progress bar with gradient logic (internally)
        let barStr = '';
        for (let i = 0; i < filled; i++) {
            const r = Math.floor(255 - (i / barWidth) * 155);
            const g = Math.min(255, Math.floor((i / barWidth) * 255 + 100));
            barStr += rgb(r, g, 100) + '█';
        }
        barStr += color.muted + '░'.repeat(empty);

        const nameLabel = bat.name.padEnd(12);
        const progText = (progValue + '%').padStart(4);
        
        console.log(color.primary + '║' + reset + `  ${stateColor}${icon}${bold}${nameLabel}${reset} ` + 
                    `[${barStr}${reset}] ` + 
                    `${stateColor}${progText}${reset}  ` +
                    `${dim}│${reset} ${stateColor}${state.padEnd(8)}${reset} ` +
                    color.primary + '║' + reset);
    });

    console.log(getGradient('╚' + '═'.repeat(68) + '╝', [0, 255, 200], [0, 255, 120]));

    // ACTIVE ISSUES PANEL (Dynamic)
    const issues = Object.entries(activeIssues);
    if (issues.length > 0) {
        console.log('\n' + color.danger + bold + ' 🚨 ALERTAS ATIVOS (PROBLEMAS DETECTADOS):' + reset);
        issues.forEach(([script, msg]) => {
            console.log(` ${color.danger}└─ ${bold}${script}:${reset} ${color.warning}${msg}${reset}`);
        });
    }

    // LOG HISTORY
    console.log('\n' + color.muted + ' 🕒 HISTÓRICO RECENTE:' + reset);
    const lastLogs = logHistory.slice(-8);
    lastLogs.forEach(entry => {
        const time = color.muted + '[' + entry.time + ']' + reset;
        const tag = entry.isError ? (color.danger + entry.script) : (color.info + entry.script);
        console.log(` ${time} ${tag.padEnd(20)} ${entry.msg}`);
    });
    
    if (startTime) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        readline.cursorTo(process.stdout, 0, 30); // Move down to avoid overlapping if logs are short
        process.stdout.write(dim + `   ⏱️  Tempo de Ciclo Atual: ${elapsed}s` + reset + '\n');
    }
}

// String helper for centering
String.prototype.center = function(width) {
    const space = width - this.length;
    if (space <= 0) return this;
    const left = Math.floor(space / 2);
    const right = space - left;
    return ' '.repeat(left) + this + ' '.repeat(right);
};

/**
 * Log an event: Appends to file and PRINTS relevant ones to terminal
 */
function logEvent(script, message, isError = true) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const timeDisplay = new Date().toLocaleTimeString('pt-BR');
    const msg = message.trim();
    if (!msg || msg.includes('@PROG')) return;

    if (isError) {
        totalErrorsCount++;
        activeIssues[script] = msg; // Update dynamic alert
    }

    // Write to file
    const logEntry = `[${timestamp}] [${script}] ${isError ? 'ERROR' : 'INFO'}: ${msg}\n`;
    try { fs.appendFileSync(LOG_FILE, logEntry); } catch (e) {}

    // Add to history display
    const isSpam = msg.includes('SECURITY WARNING') || msg.includes('Warning:') || msg.includes('adopt standard libpq');
    if (!isSpam || isError) {
        logHistory.push({ time: timeDisplay, script, msg, isError });
        if (logHistory.length > 50) logHistory.shift();
    }
}

/**
 * Runs a single .bat file
 */
function runBat(batEntry) {
    return new Promise((resolve) => {
        scriptState[batEntry.name] = 'RUNNING';
        const child = spawn('cmd.exe', ['/c', batEntry.file], {
            cwd: ROOT_DIR,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine.includes('@PROG:')) {
                    const parts = trimmedLine.split(':');
                    if (parts.length >= 3) {
                        currentStatus[parts[1]] = parts[2];
                    }
                } else if (trimmedLine.includes('❌') || (trimmedLine.toLowerCase().includes('error:') && !trimmedLine.toLowerCase().includes('warning'))) {
                    logEvent(batEntry.name, trimmedLine, true);
                } else if (trimmedLine.includes('Warning:') || trimmedLine.includes('SECURITY WARNING:')) {
                    logEvent(batEntry.name, trimmedLine, false);
                }
            });
        });

        child.stderr.on('data', (data) => {
            const errLog = data.toString().trim();
            if (errLog && !errLog.includes('terminada')) {
                if (errLog.includes('Warning:') || errLog.includes('SECURITY WARNING:')) {
                    logEvent(batEntry.name, errLog, false);
                } else {
                    logEvent(batEntry.name, errLog, true);
                    scriptState[batEntry.name] = 'ERROR';
                }
            }
        });

        child.on('close', (code) => {
            if (code !== 0) {
                scriptState[batEntry.name] = 'ERROR';
                logEvent(batEntry.name, `Finalizado com falha (código ${code})`, true);
            } else {
                scriptState[batEntry.name] = 'DONE';
                currentStatus[batEntry.name] = '100%';
                delete activeIssues[batEntry.name]; // SUCCESS! Clear alerts for this script
                logEvent(batEntry.name, "Concluído com sucesso", false);
            }
            resolve();
        });
    });
}

/**
 * Main Loop
 */
async function startForever() {
    // Clear once at beginning
    console.clear();
    process.stdout.write('\x1B[?25l');

    if (!fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(LOG_FILE, '--- SYNC FOREVER LOG START ---\n');
    }

    while (true) {
        cycleCount++;
        SYNC_BATS.forEach(b => {
            currentStatus[b.name] = '0%';
            scriptState[b.name] = 'IDLE';
        });
        
        const cycleStart = Date.now();
        drawPinnedDashboard(cycleStart);

        const timerInterval = setInterval(() => drawPinnedDashboard(cycleStart), 1000);

        // EXECUÇÃO SEQUENCIAL COM INTERVALO DE 10s
        for (let i = 0; i < SYNC_BATS.length; i++) {
            const bat = SYNC_BATS[i];
            await runBat(bat);
            
            // Aguarda 10 segundos se não for o último script do ciclo
            if (i < SYNC_BATS.length - 1) {
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_SCRIPTS));
            }
        }

        clearInterval(timerInterval);
        
        const duration = (Date.now() - cycleStart) / 1000;
        cycleHistory.push(duration);
        if (cycleHistory.length > 50) cycleHistory.shift();

        drawPinnedDashboard(cycleStart); 
        logEvent('SYSTEM', `Ciclo #${cycleCount} finalizado em ${duration}s`, false);
    }
}

process.on('SIGINT', () => {
    process.stdout.write('\x1B[?25h');
    process.exit();
});

startForever();
