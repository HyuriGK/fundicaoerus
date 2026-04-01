/**
 * MASTER SYNC FOREVER (Parallel & High-Frequency)
 * Orchestrates all industrial dashboard synchronization scripts.
 * Mode: CONCURRENT (All scripts run at once)
 * Delay: ZERO (Restarts immediately after the last one finishes)
 */

const { spawn } = require('child_process');
const path = require('path');

// CONFIGURATIONS
const SCRIPTS_DIR = __dirname;
const SYNC_SCRIPTS = [
    'sync-firebird-to-postgres.js',        // Faturamento
    'sync-production-firebird-postgres.js', // Monitoramento / Produção
    'sync-refugos-firebird-postgres.js',     // Refugos
    'sync-custos-firebird-postgres.js',     // Custos
    'sync-devolucoes.js'                   // Devoluções
];

/**
 * Runs a single script and returns a promise that resolves when it finishes.
 */
function runScript(scriptName) {
    return new Promise((resolve) => {
        console.log(`[MASTER]  iniciando ${scriptName}...`);
        
        const child = spawn('node', [path.join(SCRIPTS_DIR, scriptName)], {
            stdio: 'inherit' // Inherit stdio to see colored output and real-time logs
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log(`[MASTER] ✅ ${scriptName} finalizado.`);
            } else {
                console.error(`[MASTER] ❌ ${scriptName} parou com erro (código ${code}).`);
            }
            resolve();
        });
        
        child.on('error', (err) => {
            console.error(`[MASTER] ❌ Erro ao disparar ${scriptName}:`, err.message);
            resolve();
        });
    });
}

/**
 * Main Loop
 */
async function startForever() {
    let cycleCount = 1;

    while (true) {
        console.log('\n' + '='.repeat(80));
        console.log(`🚀 INICIANDO CICLO DE SINCRONIZAÇÃO PARALELA #${cycleCount}`);
        console.log(`⏰ Inicio: ${new Date().toLocaleString('pt-BR')}`);
        console.log('='.repeat(80) + '\n');

        const startTime = Date.now();

        // RUN ALL AT ONCE
        await Promise.all(SYNC_SCRIPTS.map(script => runScript(script)));

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log('\n' + '='.repeat(80));
        console.log(`🎉 CICLO #${cycleCount} FINALIZADO EM ${duration}s`);
        console.log(`🔄 Reiniciando IMEDIATAMENTE conforme solicitado...`);
        console.log('='.repeat(80) + '\n');

        cycleCount++;
        // No sleep, just loop back to while(true)
    }
}

// Global process error handling
process.on('uncaughtException', (err) => {
    console.error('[MASTER CRITICAL ERROR]', err);
});

// Start the engine
startForever();
