require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db'); // Use shared pool with cleaning logic


async function setup() {
    const client = await pool.connect();
    try {
        console.log('🔄 Criando tabelas para Usinagem Externa...');

        await client.query('BEGIN');

        // 1. Tabela de REGISTROS
        await client.query(`
            CREATE TABLE IF NOT EXISTS usinagem_externo_registros (
                id SERIAL PRIMARY KEY,
                carga VARCHAR(50),
                data DATE,
                terceiro VARCHAR(100),
                codigo VARCHAR(50),
                descricao VARCHAR(255),
                cliente VARCHAR(100),
                peso NUMERIC(10,2),
                quant INTEGER,
                quant_escariar INTEGER DEFAULT 0,
                quant_rebarba INTEGER DEFAULT 0,
                valor_unit NUMERIC(10,2),
                valor NUMERIC(10,2),
                observacoes TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tabela usinagem_externo_registros criada/verificada.');

        // 2. Tabela de RECEBIDOS (Relação N:N para controle de recebimento por carga)
        // Mesmo registro pode ser recebido em cargas diferentes?
        // No acabamento_externo, a lógica é: registro_id + carga (controle de checkbox)
        await client.query(`
            CREATE TABLE IF NOT EXISTS usinagem_externo_recebidos (
                registro_id INTEGER REFERENCES usinagem_externo_registros(id) ON DELETE CASCADE,
                carga VARCHAR(50),
                recebido_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (registro_id, carga)
            );
        `);
        console.log('✅ Tabela usinagem_externo_recebidos criada/verificada.');

        // 3. Tabela de ITENS MESTRES (Autopreenchimento)
        await client.query(`
            CREATE TABLE IF NOT EXISTS usinagem_externo_itens (
                codigo VARCHAR(50) PRIMARY KEY,
                descricao VARCHAR(255),
                peso NUMERIC(10,3),
                cliente VARCHAR(100)
            );
        `);
        console.log('✅ Tabela usinagem_externo_itens criada/verificada.');

        await client.query('COMMIT');
        console.log('🚀 Setup Usinagem Externa concluído com sucesso!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Erro ao criar tabelas:', error);
    } finally {
        client.release();
        pool.end();
    }
}

setup();
