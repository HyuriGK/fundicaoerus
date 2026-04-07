const path = require('path');
const Firebird = require('node-firebird');

// Carregar .env.local de forma absoluta (garante funcionamento em qualquer contexto)
// Movemos para o TOPO do arquivo antes de qualquer lógica
const envPath = path.join(__dirname, '../.env.local');
require('dotenv').config({ path: envPath });

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
const host = cleanEnv(process.env.FIREBIRD_HOST, 'Desktop-dqarv0d');

// Log de depuração para o MONITOR (SGP ERUS)
console.log(`🔌 [Firebird Helper] Credenciais carregadas: User=${user}, Host=${host} (Path: ${envPath})`);

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

module.exports = {
    Firebird,
    options,
    attach: (cb) => Firebird.attach(options, cb)
};
