/**
 * MASTER SYNC FOREVER V6 (Scrolling Log + Pinned Dashboard)
 * Orchestrates 6 batch files with a static top status board and 
 * an infinite scrolling log below it.
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const fs = require('fs');
const dns = require('dns');
const { promisify } = require('util');
const dnsLookup = promisify(dns.lookup);

// CONFIGURATIONS
const ROOT_DIR = path.join(__dirname, '..');
const LOG_FILE = path.join(ROOT_DIR, 'sync-errors.log');
const SYNC_BATS = [
    { name: 'CUSTOS', file: 'sincronizar_acustos.bat' },
    { name: 'DEVOLUÇÕES', file: 'sincronizar_adevolucoes.bat' },
    { name: 'FATURAMENTO', file: 'sincronizar_afaturamento.bat' },
    { name: 'PEDIDOS', file: 'sincronizar_apedidos.bat' },
    { name: 'PRODUÇÃO', file: 'sincronizar_aproducao.bat' },
    { name: 'REFUGOS', file: 'sincronizar_arefugo.bat' }
];

// STATE
let cycleCount = 0;
let cycleHistory = []; 
let currentStatus = {};
let totalErrorsCount = 0;
let logBuffer = []; // We use this for the persistent log file, but terminal will just scroll.

SYNC_BATS.forEach(b => currentStatus[b.name] = '0%');
let IS_STANDBY = false;
let IS_NETWORK_DOWN = false;

/**
 * Check if the machine has network access
 */
async function checkNetwork() {
    try {
        await dnsLookup('8.8.8.8');
        IS_NETWORK_DOWN = false;
        return true;
    } catch (e) {
        IS_NETWORK_DOWN = true;
        return false;
    }
}

/**
 * Check if current time is within Mon-Fri, 06:00 - 18:00
 */
function checkSchedule() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const hour = now.getHours();

    const isWeekday = day >= 1 && day <= 5;
    const isWorkingHours = hour >= 6 && hour < 18;

    IS_STANDBY = !(isWeekday && isWorkingHours);
    return !IS_STANDBY;
}

/**
 * Pinned Header Drawing (always at the top of the terminal viewport)
 */
function drawPinnedDashboard(startTime = null) {
    // Move to top and clear only what we need for the board
    readline.cursorTo(process.stdout, 0, 0);

    const avgTime = cycleHistory.length > 0 
        ? (cycleHistory.reduce((a, b) => a + b, 0) / cycleHistory.length).toFixed(1) 
        : '--';

    console.log('╔════════════════════════════════════════════════════════════╗');
    if (IS_NETWORK_DOWN) {
        console.log(`║      📡 AGUARDANDO REDE - CONEXÃO NÃO IDENTIFICADA         ║`);
    } else if (IS_STANDBY) {
        console.log(`║      💤 MODO STANDBY - FORA DO HORÁRIO COMERCIAL           ║`);
    } else {
        console.log(`║          📊 SGP ERUS - MONITOR DE SINCRONIZAÇÃO            ║`);
    }
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  🔄 CICLO: #${cycleCount.toString().padStart(3, '0')}          🕒 MÉDIA: ${avgTime}s p/ ciclo   ║`);
    console.log(`║  🚩 TOTAL ERROS: ${totalErrorsCount.toString().padStart(4, '0')}      📂 LOG: sync-errors.log       ║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    
    SYNC_BATS.forEach(bat => {
        const prog = currentStatus[bat.name] || '0%';
        const isError = prog === '⚠️ ERRO';
        
        let bar = '';
        if (isError) {
            bar = '‼ ERROR ‼'.padEnd(20, ' ');
        } else {
            const filledWidth = Math.floor((parseInt(prog) / 100) * 20);
            bar = '█'.repeat(filledWidth) + '░'.repeat(20 - filledWidth);
        }
        
        const label = bat.name.padEnd(15, ' ');
        // readline.clearLine(process.stdout, 0); // Ensure line is clean
        console.log(`║  ${label} [${bar}] ${prog.padStart(4, ' ')}  ║`);
    });

    console.log('╚════════════════════════════════════════════════════════════╝');
    
    if (startTime) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        process.stdout.write(`   ⏱️  Tempo: ${elapsed}s  |  Histórico completo abaixo: \n`);
        console.log('─'.repeat(61));
    }
}

/**
 * Log an event: Appends to file and PRINTS relevant ones to terminal
 */
function logEvent(script, message, isError = true) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const timeDisplay = new Date().toLocaleTimeString('pt-BR');
    const msg = message.trim();
    if (!msg || msg.includes('@PROG')) return;

    if (isError) totalErrorsCount++;

    // Write to persistent log file (ALWAY LOG EVERYTHING IN FILE)
    const logEntry = `[${timestamp}] [${script}] ${isError ? 'ERROR' : 'INFO'}: ${msg}\n`;
    try {
        fs.appendFileSync(LOG_FILE, logEntry);
    } catch (e) {}

    // PRINT TO TERMINAL (scrolling region) - ONLY RELEVANT STUFF
    // We filter out common library/node "spam" warnings to keep terminal dashboard clean
    const isSpam = msg.includes('SECURITY WARNING') || msg.includes('Warning:') || msg.includes('adopt standard libpq');
    
    if (!isSpam || isError) {
        const icon = isError ? '⚠️' : 'ℹ️';
        console.log(`${icon} [${timeDisplay}] ${script}: ${msg}`);
    }
}

/**
 * Runs a single .bat file
 */
function runBat(batEntry) {
    return new Promise((resolve) => {
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
                } else if (trimmedLine) {
                    // Log EVERY line that isn't @PROG to help with debugging
                    // Identify errors based on prefix or keyword
                    const isErr = trimmedLine.includes('❌') || 
                                 (trimmedLine.toLowerCase().includes('error:') && !trimmedLine.toLowerCase().includes('warning'));
                    logEvent(batEntry.name, trimmedLine, isErr);
                }
            });
        });

        child.stderr.on('data', (data) => {
            const errLog = data.toString().trim();
            if (errLog && !errLog.includes('terminada')) {
                // Ignore Node/PG specific warnings in stderr
                if (errLog.includes('Warning:') || errLog.includes('SECURITY WARNING:')) {
                    logEvent(batEntry.name, errLog, false);
                } else {
                    logEvent(batEntry.name, errLog, true);
                    currentStatus[batEntry.name] = '⚠️ ERRO';
                }
            }
        });

        child.on('close', (code) => {
            if (code !== 0) {
                currentStatus[batEntry.name] = '⚠️ ERRO';
                logEvent(batEntry.name, `Finalizado com falha (código ${code})`, true);
            } else {
                currentStatus[batEntry.name] = '100%';
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
        if (!checkSchedule()) {
            drawPinnedDashboard();
            // In standby, we just wait 5 minutes before checking again
            await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
            continue;
        }

        if (!(await checkNetwork())) {
            drawPinnedDashboard();
            // If network is down, wait 30 seconds before re-checking
            await new Promise(resolve => setTimeout(resolve, 30 * 1000));
            continue;
        }

        cycleCount++;
        SYNC_BATS.forEach(b => currentStatus[b.name] = '0%');
        
        const cycleStart = Date.now();
        drawPinnedDashboard(cycleStart);

        const timerInterval = setInterval(() => drawPinnedDashboard(cycleStart), 1000);

        await Promise.all(SYNC_BATS.map(bat => runBat(bat)));

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
