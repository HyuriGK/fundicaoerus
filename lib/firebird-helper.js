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
const _fbDebugHost = cleanEnv(process.env.FIREBIRD_HOST, 'Desktop-dqarv0d');
console.log(`[FIREBIRD-HELPER] HOST=${_fbDebugHost} DB=${cleanEnv(process.env.FIREBIRD_DATABASE, '(default)')}`);
const options = {
    host: _fbDebugHost,
    port: parseInt(process.env.FIREBIRD_PORT) || 3050,
    database: cleanEnv(process.env.FIREBIRD_DATABASE, '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb'),
    user: user,
    password: pass,
    lowercase_keys: false,
    pageSize: 4096,
    wireCrypt: true,
    role: null
};

// =============================================================================
// MONKEY-PATCH UNIVERSAL: Intercepta todas as chamadas ao Firebird.attach
// Isso garante que mesmo scripts que chamam Firebird.attach diretamente
// (ignoring o helper) agora tenham lógica de retry e validação.
// =============================================================================

const originalAttach = Firebird.attach;

Firebird.attach = function(attachOptions, cb) {
    const maxAttempts = 3;
    let attempts = 0;

    // Validação estrita de credenciais
    const currentOptions = attachOptions || options;
    if (!currentOptions.user || typeof currentOptions.user !== 'string' || currentOptions.user.length < 2) {
        console.error('❌ [FIREBIRD-PATCH] Usuário não definido ou inválido no momento da conexão!');
        return cb(new Error('Your user name and password are not defined. (Intercepted by Helper)'));
    }

    function attemptAttach() {
        attempts++;
        originalAttach(currentOptions, (err, db) => {
            if (err) {
                const errorStr = (err.message || '').toLowerCase();
                const isAuthError = errorStr.includes('user') || 
                                  errorStr.includes('password') ||
                                  err.gdscode === 335544472;

                if (isAuthError && attempts < maxAttempts) {
                    // Usamos um ícone diferente para o monitor saber que é temporário
                    console.warn(`⏳ [FIREBIRD-PATCH] Login falhou (tentativa ${attempts}/${maxAttempts}). Reconectando em 3s...`);
                    setTimeout(attemptAttach, 3000);
                    return;
                }

                if (attempts >= maxAttempts) {
                    console.error(`❌ [FIREBIRD-PATCH] Falha definitiva após ${maxAttempts} tentativas.`);
                }
            } else {
                if (attempts > 1) {
                    console.log(`✅ [FIREBIRD-PATCH] Conexão confirmada na tentativa ${attempts}!`);
                } else if (process.env.DEBUG_SYNC) {
                    console.log('✅ [FIREBIRD-PATCH] Conexão estabelecida.');
                }
            }
            cb(err, db);
        });
    }

    attemptAttach();
};

module.exports = {
    Firebird,
    options,
    attach: (cb) => Firebird.attach(options, cb) // Agora usa a versão patched
};
