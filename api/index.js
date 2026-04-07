// api/index.js
require('dotenv').config({ path: '.env.local' });
const express = require('express');
const app = express();
const cors = require('cors'); // Adicionar CORS para requisições do frontend

// Configuração do CORS (importante para requisições do frontend)
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? ['https://fundicaoerus.vercel.app', 'https://seusite.com.br']
        : ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware para entender JSON
// Aumentamos o limite para 50MB (mais que suficiente para planilhas grandes)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware de logging para debug
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    if (req.method === 'POST' && req.body) {
        console.log('Body size:', JSON.stringify(req.body).length, 'bytes');
    }
    next();
});

// --- IMPORTAÇÃO DOS ARQUIVOS DA PASTA SRC ---
// Note que estou usando "../src/" para voltar uma pasta e entrar em src
const acabamentoExterno = require('../src/acabamento-externo');
const acabamentoInterno = require('../src/acabamento-interno');
const aderencia = require('../src/aderencia');
const amostra = require('../src/amostra');
const auth = require('../src/auth');
const carteira = require('../src/carteira');
const dureza = require('../src/dureza');
const faturamento = require('../src/faturamento');
const fatDetalhado = require('../src/faturamento-clientes-detalhado');
const metas = require('../src/metas');
const producaoApontada = require('../src/producao-apontada');
const refugo = require('../src/refugo');
const register = require('../src/register');
const custosRoutes = require('../src/custos');
const weightsRoutes = require('../src/weights');
const faturamentoFirebird = require('../src/faturamento-firebird');
const faturamentoPostgres = require('../src/faturamento-postgres'); // NOVO: API PostgreSQL
const faturamentoNeon = require('../src/faturamento-neon');
const faturamentoFiltros = require('../src/faturamento-filtros');
const usinagemExterno = require('../src/usinagem-externo'); // NOVO: Usinagem Externa
const assertividade = require('../src/assertividade'); // NOVA: Assertividade Sincronizada
const devolucoes = require('../src/devolucoes'); // NOVA: Devoluções Sincronizadas
const emissoes = require('../src/emissoes-api'); // NOVO: Histórico de Emissões



// --- DEFINIÇÃO DAS ROTAS ---
// Aqui definimos qual URL chama qual arquivo
app.use('/api/weights', weightsRoutes);
app.use('/api/faturamento-firebird', faturamentoFirebird);
app.use('/api/faturamento-postgres', faturamentoPostgres); // NOVO: Dados sincronizados do Firebird
app.use('/api/faturamento-neon', faturamentoNeon);
app.use('/api/faturamento-filtros', faturamentoFiltros);
app.use('/api/preferences', require('../src/preferences')); // NOVO: Preferências de usuário
app.use('/api/acabamento-externo', acabamentoExterno);
app.use('/api/acabamento-interno', acabamentoInterno);
app.use('/api/aderencia', aderencia);
app.use('/api/amostra', amostra);
app.use('/api/auth', auth); // Ex: /api/auth/login
app.use('/api/carteira', carteira);
app.use('/api/dureza', dureza);
app.use('/api/faturamento', faturamento);
app.use('/api/faturamento-clientes-detalhado', fatDetalhado);
app.use('/api/metas', metas);
app.use('/api/producao-apontada', producaoApontada);
app.use('/api/refugo', refugo); // Legacy
app.use('/api/refugos-new', require('../src/refugos')); // NEW: Data from Firebird Sync
app.use('/api/register', register);
app.use('/api/custos', custosRoutes);
app.use('/api/pedidos-sync', require('../src/pedidos-sync'));
app.use('/api/assertividade', assertividade); // NOVA: Assertividade Sincronizada
app.use('/api/usinagem-externo', usinagemExterno); // NOVO: Usinagem Externa
app.use('/api/devolucoes', devolucoes); // NOVA: Devoluções Sincronizadas
app.use('/api/emissoes', emissoes); // NOVO: Histórico de Emissões


app.use('/api/producao-postgres', require('../src/producao-postgres')); // NOVO: Produção Sincronizada
app.use('/api/pedidos-firebird', require('../src/pedidos-firebird')); // NOVO: Pedidos Histórico Firebird
app.use('/api/admin/users', require('../src/admin-users')); // NOVO: Gestão de Usuários (Admin)
app.use('/api/ai-assistant', require('../src/ai-assistant')); // NOVO: Assistente de IA
app.use('/api/audit-logger', require('../src/audit-logger')); // NOVO: Log de Atividades
app.use('/api/page-locks', require('../src/page-locks')); // NOVO: Bloqueio de Telas
app.use('/api/custos-dashboard', require('../src/custos-dashboard')); // NOVO: Painel de Produção
app.use('/api/custos-detalhados', require('../src/custos-detalhados-firebird')); // NOVO: Detalhamento de Custos (Postgres Sync)
app.use('/api/centro-custos', require('../src/centro-custos')); // NOVO: Centro de Custos (Mapeamento)
app.use('/api/fichatecnica', require('../src/fichatecnica')); // NOVO: Ficha Técnica (Firebird Read-Only)
app.use('/api/communications', require('../src/communications')); // NOVO: Sistema de Comunicação

// Rota temporária de diagnóstico do Firebird
app.get('/api/test-firebird', (req, res) => {
    const Firebird = require('node-firebird');
    const options = {
        host: process.env.FIREBIRD_HOST || 'Desktop-dqarv0d',
        port: parseInt(process.env.FIREBIRD_PORT) || 3050,
        database: process.env.FIREBIRD_DATABASE || '\\\\01\\\\LM-Sistemas\\\\SIGE2.0\\\\Dados\\\\ERUS.fdb',
        user: process.env.FIREBIRD_USER || 'SYSDBA',
        password: process.env.FIREBIRD_PASSWORD || 'masterkey'
    };
    Firebird.attach(options, (err, db) => {
        if (err) return res.status(500).json({ error: 'Connection failed', details: err.message });
        db.query('SELECT FIRST 1 * FROM PEDIDO', (err, result) => {
            db.detach();
            if (err) return res.status(500).json({ error: 'Query failed', details: err.message });
            res.json({ status: 'OK', rows: result.length, sample: result[0] });
        });
    });
});


// Rota de teste para ver se a API está de pé
app.get('/api', (req, res) => {
    res.json({
        status: 'API Online',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        features: {
            carteira: true,
            email: !!process.env.SMTP_USER,
            database: !!process.env.DATABASE_URL
        }
    });
});

// Rota de saúde do sistema (health check)
app.get('/api/health', async (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: 'unknown',
        email: 'unknown'
    };

    try {
        // Testar conexão com banco
        const pool = require('../lib/db');
        const dbResult = await pool.query('SELECT 1 as test');
        health.database = dbResult.rows[0].test === 1 ? 'connected' : 'error';
    } catch (dbError) {
        health.database = 'disconnected';
        health.dbError = dbError.message;
    }

    // Verificar configuração de email
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        health.email = 'configured';
    } else {
        health.email = 'not configured';
    }

    // Se database está desconectado, mudar status
    if (health.database === 'disconnected') {
        health.status = 'unhealthy';
        res.status(503).json(health);
    } else {
        res.json(health);
    }
});

// Rota para informações de configuração (debug)
if (process.env.NODE_ENV !== 'production') {
    app.get('/api/debug/env', (req, res) => {
        const safeEnv = { ...process.env };

        // Ocultar informações sensíveis
        if (safeEnv.SMTP_PASS) safeEnv.SMTP_PASS = '***hidden***';
        if (safeEnv.DATABASE_URL) {
            // Mostrar apenas o início da URL do banco
            const dbUrl = safeEnv.DATABASE_URL;
            safeEnv.DATABASE_URL = dbUrl.substring(0, 30) + '...';
        }

        res.json({
            node_env: process.env.NODE_ENV,
            env_vars: Object.keys(safeEnv),
            safe_env: safeEnv
        });
    });
}

// Middleware para tratamento de rotas não encontradas
app.use('/api/*', (req, res) => {
    res.status(404).json({
        error: 'Rota não encontrada',
        path: req.originalUrl,
        method: req.method,
        availableRoutes: [
            '/api/acabamento-externo',
            '/api/acabamento-interno',
            '/api/aderencia',
            '/api/amostra',
            '/api/auth',
            '/api/carteira',
            '/api/dureza',
            '/api/faturamento',
            '/api/faturamento-postgres',
            '/api/faturamento-clientes-detalhado',
            '/api/preferences',
            '/api/metas',
            '/api/producao-apontada',
            '/api/refugo',
            '/api/register',
            '/api/custos',
            '/api/health'
        ]
    });
});

// --- ADICIONE ISTO NO FINAL, ANTES DO EXPORT ---
// Middleware de Tratamento de Erros Global
app.use((err, req, res, next) => {
    console.error("ERRO NO SERVIDOR:", err); // Mostra no terminal/logs da Vercel

    // Log detalhado do erro
    console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        body: req.body
    });

    // Determinar o status code apropriado
    const statusCode = err.statusCode || err.status || 500;

    res.status(statusCode).json({
        success: false,
        message: process.env.NODE_ENV === 'production'
            ? "Erro interno no servidor"
            : err.message,
        error: process.env.NODE_ENV === 'production' ? undefined : err.stack,
        timestamp: new Date().toISOString()
    });
});

// Middleware para tratamento de promises não tratadas
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// Exporta o app para a Vercel rodar
module.exports = app;

// --- INICIALIZAÇÃO LOCAL ---
// Se este arquivo for executado diretamente (node api/index.js), iniciamos o servidor
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`\n🚀 Servidor rodando localmente!`);
        console.log(`📡 URL: http://localhost:${PORT}`);
        console.log(`📝 Ambiente: ${process.env.NODE_ENV || 'development'}\n`);
    });
}