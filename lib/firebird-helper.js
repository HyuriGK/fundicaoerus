const path = require('path');
const Firebird = require('node-firebird');

// Carregar .env.local de forma absoluta e FORÇAR SOBRESCRITA (override: true)
// Isso garante que se o Windows tiver variáveis globais, o .env.local sempre vença.
const envPath = path.join(__dirname, '../.env.local');
require('dotenv').config({ path: envPath, override: true });

/**
 * Função utilitária para limpar valores de ambiente
 */
function cleanEnv(val, fallback) {
    if (!val || typeof val !== 'string' || val.trim() === '' || val === 'undefined' || val === 'null') {
        return fallback;
    }
    const cleaned = val.trim().replace(/^['"]|['"]$/g, '');
    if (cleaned === '') return fallback;
    return cleaned;
}

const user = cleanEnv(process.env.FIREBIRD_USER, 'SYSDBA');
const pass = cleanEnv(process.env.FIREBIRD_PASSWORD, 'masterkey');
const host = cleanEnv(process.env.FIREBIRD_HOST, 'Desktop-dqarv0d');

/**
 * Utilitário Centralizado para Firebird
 * Configuração validada para node-firebird v2.0.2+ e Firebird 4.0
 */
const options = {
    host: host,
    port: parseInt(process.env.FIREBIRD_PORT) || 3050,
    database: cleanEnv(process.env.FIREBIRD_DATABASE, '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb'),
    user: user,
    password: pass,
    lowercase_keys: false,
    pageSize: 4096,
    wireCrypt: true,
    role: null
};

/**
 * Conecta ao Firebird com tentativas automáticas (Retries)
 * Resolve o erro intermitente "Your user name and password are not defined"
 */
async function attachWithRetry(maxRetries = 3) {
    console.log(`🔌 [Firebird Helper] Tentando conexão (User=${user}, Host=${host})...`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const db = await new Promise((resolve, reject) => {
                Firebird.attach(options, (err, db) => {
                    if (err) return reject(err);
                    resolve(db);
                });
            });
            console.log(`✅ [Firebird Helper] Conectado na tentativa ${attempt}.`);
            return db;
        } catch (err) {
            const isAuthError = err.message.includes('user name and password are not defined');
            if (isAuthError && attempt < maxRetries) {
                console.warn(`⏳ [Firebird Helper] Erro de autenticação (blip de rede). Tentativa ${attempt}/${maxRetries} falhou. Tentando novamente em 2s...`);
                await new Promise(r => setTimeout(r, 2000));
            } else {
                console.error(`❌ [Firebird Helper] Falha fatal após ${attempt} tentativas.`);
                throw err;
            }
        }
    }
}

module.exports = {
    Firebird,
    options,
    attachWithRetry
};
