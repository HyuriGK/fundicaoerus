// lib/db.js
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
    connectionTimeoutMillis: 60000, // Tempo máximo para tentar conectar
    allowExitOnIdle: true, // Permite que o processo saia quando o pool estiver idle
});

// Log de eventos do pool para debug
pool.on('connect', () => {
    console.log('✅ Nova conexão estabelecida com o banco');
});

pool.on('error', (err) => {
    console.error('❌ Erro inesperado no pool de conexões:', err);
});

pool.on('remove', () => {
    console.log('ℹ️ Conexão removida do pool');
});

// Testar a conexão ao iniciar
async function testConnection() {
    let client;
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
            AND table_name IN ('carteira', 'pesos_customizados', 'quantidades_manuais', 'page_locks')
            ORDER BY table_name
        `);

        console.log('📊 Tabelas encontradas:', tables.rows.map(row => row.table_name).join(', ') || 'Nenhuma tabela encontrada');

    } catch (error) {
        console.error('❌ Falha ao conectar ao banco de dados:', error.message);
        console.error('📋 Detalhes do erro:', error);
        throw error;
    } finally {
        if (client) {
            client.release();
        }
    }
}

// Executar teste de conexão (apenas uma vez)
let connectionTested = false;
if (!connectionTested) {
    testConnection().catch(err => {
        console.error('🚨 Falha crítica na conexão com o banco:', err);
        // Não encerra o processo para permitir que o servidor tente se recuperar
    });
    connectionTested = true;
}

module.exports = pool;