const Firebird = require('node-firebird');
const path = require('path');

// Carregar .env.local de forma absoluta e forçar override (garante consistência no monitor)
const envPath = path.join(__dirname, '../.env.local');
require('dotenv').config({ path: envPath, override: true });

/**
 * Função utilitária para limpar valores de ambiente
 */
function cleanEnv(val, fallback) {
    if (!val || typeof val !== 'string') return fallback;
    const cleaned = val.trim().replace(/^['"]|['"]$/g, '');
    if (cleaned === '' || cleaned === 'undefined' || cleaned === 'null') return fallback;
    return cleaned;
}

const user = cleanEnv(process.env.FIREBIRD_USER, 'SYSDBA');
const pass = cleanEnv(process.env.FIREBIRD_PASSWORD, 'masterkey');

// Log discreto apenas no terminal para conferência de carga
if (process.env.DEBUG_SYNC) {
    console.log(`[FIREBIRD-HELPER] Iniciado com usuário: ${user}`);
}

/**
 * Utilitário Centralizado para Firebird
 * Configuração validada para node-firebird v2.0.2+ e Firebird 4.0
 */
const options = {
    host: cleanEnv(process.env.FIREBIRD_HOST, 'Desktop-dqarv0d'),
    port: parseInt(process.env.FIREBIRD_PORT) || 3050,
    database: cleanEnv(process.env.FIREBIRD_DATABASE, '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb'),
    user: user,
    password: pass,
    lowercase_keys: false,
    pageSize: 4096,
    wireCrypt: true,
    role: null
};

module.exports = {
    Firebird,
    options,
    attach: (cb) => Firebird.attach(options, cb)
};
