const Firebird = require('node-firebird');
const path = require('path');

/**
 * Função utilitária para limpar valores de ambiente
 */
function cleanEnv(val, fallback) {
    if (!val || typeof val !== 'string') return fallback;
    const cleaned = val.trim().replace(/^['"]|['"]$/g, '');
    if (cleaned === '' || cleaned === 'undefined' || cleaned === 'null') return fallback;
    return cleaned;
}

// Lê diretamente o .env.local para garantir os valores do Firebird,
// ignorando qualquer variável de ambiente pré-existente no processo.
(function loadFirebirdEnv() {
    try {
        const fs = require('fs');
        const content = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
        ['FIREBIRD_HOST', 'FIREBIRD_PORT', 'FIREBIRD_DATABASE', 'FIREBIRD_USER', 'FIREBIRD_PASSWORD'].forEach(key => {
            const m = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
            if (m) process.env[key] = m[1].trim();
        });
    } catch (e) {
        console.error('[FIREBIRD-HELPER] Falha ao ler .env.local:', e.message);
    }
})();

const user = cleanEnv(process.env.FIREBIRD_USER, 'SYSDBA');
const pass = cleanEnv(process.env.FIREBIRD_PASSWORD, 'masterkey');

/**
 * Utilitário Centralizado para Firebird
 * Configuração validada para node-firebird v2.0.2+ e Firebird 4.0
 */
const options = {
    host: '10.1.1.100',
    port: 3050,
    database: 'C:\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: user,
    password: pass,
    lowercase_keys: false,
    pageSize: 4096,
    wireCrypt: true,
    // O servidor passou a usar AuthServer = Srp256, Legacy_Auth (alteração da LM em 2026-06).
    // O node-firebird 2.0.2 trava no handshake Srp256 (bug). Legacy_Auth é aceito pelo
    // servidor e funciona — força esse plugin para não depender da config do servidor.
    pluginName: 'Legacy_Auth',
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
