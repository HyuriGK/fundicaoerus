/**
 * MASTER SYNC FOREVER V2 (Parallel Batch Orchestrator)
 * Orchestrates 6 specific batch files for industrial dashboard sync.
 * Mode: CONCURRENT (All .bat files run at once)
 * Delay: ZERO (Restarts immediately after the last one finishes)
 */

const { spawn } = require('child_process');
const path = require('path');

// CONFIGURATIONS
const ROOT_DIR = path.join(__dirname, '..');
const SYNC_BATS = [
    'sincronizar_acustos.bat',
    'sincronizar_adevolucoes.bat',
    'sincronizar_afaturamento.bat',
    'sincronizar_apedidos.bat',
    'sincronizar_aproducao.bat',
    'sincronizar_arefugo.bat'
];

/**
 * Runs a single .bat file and returns a promise.
 */
function runBat(batName) {
    return new Promise((resolve) => {
        // Use cmd.exe /c to execute batch files on Windows
        const child = spawn('cmd.exe', ['/c', batName], {
            cwd: ROOT_DIR,
            stdio: 'inherit' // Keep inherited to see the stylized output from scripts
        });

        child.on('close', (code) => {
            if (code !== 0) {
                console.error(`[MAESTRO] ⚠️ ${batName} finalizou com código ${code}.`);
            }
            resolve();
        });

        child.on('error', (err) => {
            console.error(`[MAESTRO] ❌ Erro ao disparar ${batName}:`, err.message);
            resolve();
        });
    });
}

/**
 * Main Loop
 */
async function startForever() {
    let cycleCount = 1;

    // Clear console for the first run
    console.clear();

    while (true) {
        console.log('\n' + '╔' + '═'.repeat(60) + '╗');
        console.log(`║           🔄 CICLO DE SINCRONIZAÇÃO PARALELA #${cycleCount.toString().padStart(3, '0')}          ║`);
        console.log(`║           ⏰ Início: ${new Date().toLocaleString('pt-BR')}           ║`);
        console.log('╚' + '═'.repeat(60) + '╝' + '\n');

        const startTime = Date.now();

        // RUN ALL SPECIFIED BATCH FILES AT ONCE
        await Promise.all(SYNC_BATS.map(bat => runBat(bat)));

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log('\n' + '─'.repeat(62));
        console.log(`✨ CICLO #${cycleCount} FINALIZADO EM ${duration}s`);
        console.log(`🔄 Reiniciando imediatamente conforme solicitado...`);
        console.log('─'.repeat(62) + '\n');

        cycleCount++;
        // Zero delay loop
    }
}

// Global error handling
process.on('uncaughtException', (err) => {
    console.error('[MASTER CRITICAL ERROR]', err);
});

// Launch the engine
startForever();
