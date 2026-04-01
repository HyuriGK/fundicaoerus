/**
 * MASTER SYNC FOREVER V3 (Static Dashboard Edition)
 * Orchestrates 6 batch files with a real-time, non-scrolling UI.
 * Features: Concurrent execution, Static board updates, Average Cycle Time.
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
let cycleHistory = []; // Durations in seconds
let currentStatus = {};
SYNC_BATS.forEach(b => currentStatus[b.name] = '0%');

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
        const barWidth = 20;
        const filledWidth = Math.floor((parseInt(prog) / 100) * barWidth);
        const bar = '█'.repeat(filledWidth) + '░'.repeat(barWidth - filledWidth);
        
        const label = bat.name.padEnd(15, ' ');
        console.log(`║  ${label} [${bar}] ${prog.padStart(4, ' ')}  ║`);
    });

    console.log('╚════════════════════════════════════════════════════════════╝');
    
    if (startTime) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        process.stdout.write(`\n   ⏱️ Tempo atual do ciclo: ${elapsed}s\n`);
    }
}

/**
 * Runs a single .bat file and parses @PROG signals
 */
function runBat(batEntry) {
    return new Promise((resolve) => {
        const child = spawn('cmd.exe', ['/c', batEntry.file], {
            cwd: ROOT_DIR,
            stdio: ['ignore', 'pipe', 'pipe'] // Pipe stdout/stderr to parse signals
        });

        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                if (line.includes('@PROG:')) {
                    const parts = line.trim().split(':');
                    if (parts.length >= 3) {
                        const name = parts[1];
                        const val = parts[2];
                        currentStatus[name] = val;
                        // Trigger re-render (optional: debounce if too fast)
                    }
                }
            });
        });

        child.on('close', () => {
            currentStatus[batEntry.name] = '100%';
            resolve();
        });
    });
}

/**
 * Main Loop
 */
async function startForever() {
    // Hide cursor for better appearance
    process.stdout.write('\x1B[?25l');

    while (true) {
        cycleCount++;
        SYNC_BATS.forEach(b => currentStatus[b.name] = '0%');
        
        const cycleStart = Date.now();
        
        // Initial render for the cycle
        renderDashboard(cycleStart);

        // Update timer every second
        const timerInterval = setInterval(() => renderDashboard(cycleStart), 1000);

        // RUN ALL CONCURRENTLY
        await Promise.all(SYNC_BATS.map(bat => runBat(bat)));

        clearInterval(timerInterval);
        
        const duration = (Date.now() - cycleStart) / 1000;
        cycleHistory.push(duration);
        if (cycleHistory.length > 50) cycleHistory.shift(); // Keep last 50 cycles for average

        renderDashboard(cycleStart); 
        
        // Zero delay - starts next cycle immediately
    }
}

// Ensure cursor is shown on exit
process.on('SIGINT', () => {
    process.stdout.write('\x1B[?25h');
    process.exit();
});

startForever();
