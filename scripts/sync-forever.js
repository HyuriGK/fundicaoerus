/**
 * MASTER SYNC FOREVER V4 (Dashboard + Error Monitoring)
 * Orchestrates 6 batch files with real-time status and error logging.
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

// CONFIGURATIONS
const ROOT_DIR = path.join(__dirname, '..');
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
let lastErrors = []; // Array of { time: string, msg: string, script: string }
SYNC_BATS.forEach(b => currentStatus[b.name] = '0%');

/**
 * Adds an error to the log, keeping only the last 5 unique ones.
 */
function logError(script, message) {
    const time = new Date().toLocaleTimeString('pt-BR');
    const msg = message.trim();
    if (!msg || msg.includes('@PROG')) return;

    // Evitar duplicatas idênticas seguidas
    if (lastErrors.length > 0 && lastErrors[0].msg === msg) return;

    lastErrors.unshift({ time, msg, script });
    if (lastErrors.length > 5) lastErrors.pop();
}

/**
 * Renders the Static Dashboard
 */
function renderDashboard(startTime = null) {
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);

    const avgTime = cycleHistory.length > 0 
        ? (cycleHistory.reduce((a, b) => a + b, 0) / cycleHistory.length).toFixed(1) 
        : '--';

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log(`║          📊 SGP ERUS - MONITOR DE SINCRONIZAÇÃO            ║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  🔄 CICLO: #${cycleCount.toString().padStart(3, '0')}          🕒 MÉDIA: ${avgTime}s p/ ciclo   ║`);
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
        console.log(`║  ${label} [${bar}] ${prog.padStart(4, ' ')}  ║`);
    });

    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║               🛑 STATUS / ÚLTIMOS ERROS                    ║');
    console.log('╠════════════════════════════════════════════════════════════╣');

    if (lastErrors.length === 0) {
        console.log('║  ✅ Sem erros detectados no momento.                       ║');
    } else {
        lastErrors.forEach(err => {
            const line = `[${err.time}] ${err.script}: ${err.msg}`;
            console.log(`║  ⚠️ ${line.substring(0, 53).padEnd(53, ' ')} ║`);
        });
        // Preencher o resto se tiver menos de 5
        for (let i = lastErrors.length; i < 3; i++) {
            console.log('║                                                            ║');
        }
    }

    console.log('╚════════════════════════════════════════════════════════════╝');
    
    if (startTime) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        process.stdout.write(`\n   ⏱️ Tempo atual do ciclo: ${elapsed}s (Pressione Ctrl+C para parar)\n`);
    }
}

/**
 * Runs a single .bat file and parses @PROG signals + Errors
 */
function runBat(batEntry) {
    return new Promise((resolve) => {
        const child = spawn('cmd.exe', ['/c', batEntry.file], {
            cwd: ROOT_DIR,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // Capturar Saída Padrão (Signals)
        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine.includes('@PROG:')) {
                    const parts = trimmedLine.split(':');
                    if (parts.length >= 3) {
                        currentStatus[parts[1]] = parts[2];
                    }
                } else if (trimmedLine.includes('❌') || trimmedLine.toLowerCase().includes('error:')) {
                    logError(batEntry.name, trimmedLine);
                }
            });
        });

        // Capturar Erros Técnicos (stderr)
        child.stderr.on('data', (data) => {
            const errLog = data.toString().trim();
            if (errLog && !errLog.includes('terminada')) {
                logError(batEntry.name, errLog);
                currentStatus[batEntry.name] = '⚠️ ERRO';
            }
        });

        child.on('close', (code) => {
            if (code !== 0) {
                currentStatus[batEntry.name] = '⚠️ ERRO';
                logError(batEntry.name, `Processo finalizado com erro (${code})`);
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
    process.stdout.write('\x1B[?25l');

    while (true) {
        cycleCount++;
        SYNC_BATS.forEach(b => {
             // Se estava em erro, tentamos novamente
             currentStatus[b.name] = '0%';
        });
        
        const cycleStart = Date.now();
        renderDashboard(cycleStart);

        const timerInterval = setInterval(() => renderDashboard(cycleStart), 1000);

        await Promise.all(SYNC_BATS.map(bat => runBat(bat)));

        clearInterval(timerInterval);
        
        const duration = (Date.now() - cycleStart) / 1000;
        cycleHistory.push(duration);
        if (cycleHistory.length > 50) cycleHistory.shift();

        renderDashboard(cycleStart); 
    }
}

// Ensure cursor is shown on exit
process.on('SIGINT', () => {
    process.stdout.write('\x1B[?25h');
    process.exit();
});

startForever();
