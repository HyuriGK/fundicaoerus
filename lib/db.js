// lib/db.js
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

// Função para limpar a string de conexão do Neon
function cleanConnectionString(connectionString) {
    if (!connectionString) {
        throw new Error('DATABASE_URL não definida nas variáveis de ambiente');
    }

    // Remove o prefixo 'psql' e aspas se existirem
    let cleaned = connectionString.trim();

    // Se começar com 'psql', remove
    if (cleaned.startsWith('psql')) {
        cleaned = cleaned.substring(4).trim();
    }

    // Remove aspas simples ou duplas no início e fim
    cleaned = cleaned.replace(/^['"]|['"]$/g, '');

    return cleaned;
}

// Obter e limpar a string de conexão
const rawConnectionString = process.env.DATABASE_URL || '';
let connectionString;

try {
    connectionString = cleanConnectionString(rawConnectionString);
    console.log('🔗 String de conexão limpa com sucesso');
    console.log('📝 Início da conexão:', connectionString.substring(0, 50) + '...');
} catch (error) {
    console.error('❌ Erro ao processar DATABASE_URL:', error.message);
    console.error('📋 DATABASE_URL original:', rawConnectionString.substring(0, 100) + '...');
    throw error;
}

// Configurar o pool de conexões
const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false // Necessário para Neon
    },
    // Otimizações para o pool
    max: 20, // Número máximo de clientes no pool (aumentado para Vercel)
    idleTimeoutMillis: 30000, // Tempo máximo que um cliente pode ficar idle no pool
    connectionTimeoutMillis: 120000, // Tempo máximo para tentar conectar (aumentado para scripts longos)
    allowExitOnIdle: true, // Permite que o processo saia quando o pool estiver idle
});

// Log de eventos do pool para debug
pool.on('connect', () => {
    console.log('✅ Nova conexão estabelecida com o banco');
});

pool.on('error', (err, client) => {
    console.error('❌ Erro inesperado no pool de conexões:', err.message);
    if (err.message.includes('terminated unexpectedly')) {
        console.error('ℹ️ A conexão foi encerrada inesperadamente pelo servidor (Neon).');
    }
});

pool.on('remove', () => {
    // Silenced for better user experience
});

// Testar a conexão ao iniciar com lógica de retentativa
async function testConnection(maxRetries = 5) {
    let client;
    let attempt = 1;

    console.log('🏁 Iniciando teste de conexão com o banco de dados...');

    while (attempt <= maxRetries) {
        try {
            client = await pool.connect();
            const result = await client.query('SELECT NOW() as current_time');
            console.log('✅ Conexão com o banco de dados estabelecida com sucesso');
            console.log('🕒 Hora do banco:', result.rows[0].current_time);

            // Verificar as tabelas necessárias
            await client.query(`
                CREATE TABLE IF NOT EXISTS page_locks (
                    page_id TEXT PRIMARY KEY,
                    is_locked BOOLEAN DEFAULT FALSE,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            const tables = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('carteira', 'pesos_customizados', 'quantidades_manuais', 'page_locks', 'faturamento_firebird')
                ORDER BY table_name
            `);

            console.log('📊 Tabelas encontradas:', tables.rows.map(row => row.table_name).join(', ') || 'Nenhuma tabela encontrada');
            return true; // Sucesso!

        } catch (error) {
            console.error(`❌ Tentativa ${attempt}/${maxRetries} falhou:`, error.message);

            if (attempt === maxRetries) {
                console.error('🚨 Todas as tentativas de conexão falharam. Verifique sua conexão ou se o banco Neon está ativo.');
                throw error;
            }

            // Se for timeout ou erro de conexão, o banco pode estar "acordando"
            const isRetryable = error.message.includes('ETIMEDOUT') ||
                error.message.includes('ECONNREFUSED') ||
                error.message.includes('terminated unexpectedly');

            if (isRetryable) {
                const delay = 5000; // 5 segundos
                console.log(`ℹ️ O banco de dados pode estar hibernando (Neon). Aguardando ${delay / 1000}s para tentar novamente...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                attempt++;
            } else {
                throw error; // Erro fatal (ex: credenciais erradas), não adianta tentar de novo
            }
        } finally {
            if (client) {
                client.release();
            }
        }
    }
}

// Executar teste de conexão apenas se este for o arquivo principal (não em scripts)
if (require.main === module) {
    testConnection().catch(err => {
        console.error('🚨 Falha crítica na conexão com o banco:', err.message);
    });
}

module.exports = pool;