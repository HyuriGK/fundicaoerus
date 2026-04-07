const Firebird = require('node-firebird');
require('dotenv').config({ path: '.env.local' });

/**
 * Utilitário Centralizado para Firebird
 * Garante compatibilidade 2.0.2+ e Firebird 4.0
 */
const options = {
    host: process.env.FIREBIRD_HOST || 'Desktop-dqarv0d',
    port: parseInt(process.env.FIREBIRD_PORT) || 3050,
    database: process.env.FIREBIRD_DATABASE || '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: process.env.FIREBIRD_USER || 'SYSDBA',
    username: process.env.FIREBIRD_USER || 'SYSDBA', // Adicionando username para compatibilidade v2
    password: process.env.FIREBIRD_PASSWORD || 'masterkey',
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
