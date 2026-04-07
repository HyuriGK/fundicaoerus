const Firebird = require('node-firebird');
require('dotenv').config({ path: '.env.local' });

/**
 * Utilitário Central de Conexão Firebird
 * Garante compatibilidade com v4.0 (wireCrypt: true) e centraliza credenciais.
 */
const firebirdOptions = {
    host: process.env.FIREBIRD_HOST || 'Desktop-dqarv0d',
    port: parseInt(process.env.FIREBIRD_PORT) || 3050,
    database: process.env.FIREBIRD_DATABASE || '\\01\\LM-Sistemas\\SIGE2.0\\Dados\\ERUS.fdb',
    user: process.env.FIREBIRD_USER || 'SYSDBA',
    password: process.env.FIREBIRD_PASSWORD || 'masterkey',
    lowercase_keys: false,
    pageSize: 4096,
    // ESSENCIAL PARA FIREBIRD 3.0+
    wireCrypt: true
};

module.exports = {
    Firebird,
    options: firebirdOptions,
    attach: (callback) => Firebird.attach(firebirdOptions, callback)
};
