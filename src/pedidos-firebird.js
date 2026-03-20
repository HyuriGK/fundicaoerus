const express = require('express');
const router = express.Router();
const Firebird = require('node-firebird');
const pool = require('../lib/db'); // Adicionado para consulta no Postgres

// Configuração do Firebird
const firebirdOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096,
    retry: 3
};

/**
 * Função utilitária para executar queries no Firebird com tratamento de erros
 * e tentativa de reconexão automática.
 */
async function executeQuery(query, params = []) {
    let lastError = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let dbConn = null;
        try {
            if (attempt > 1) {
                console.log(`🔄 [Firebird] Tentativa ${attempt}/${maxRetries} após erro...`);
                await new Promise(resolve => setTimeout(resolve, 1500 * (attempt - 1))); // Incremental delay
            }

            const db = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout de conexão com Firebird')), 12000);
                Firebird.attach(firebirdOptions, (err, db) => {
                    clearTimeout(timeout);
                    if (err) reject(err);
                    else resolve(db);
                });
            });

            dbConn = db;

            const result = await new Promise((resolve, reject) => {
                db.query(query, params, (err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                });
            });

            return result;

        } catch (err) {
            lastError = err;
            console.error(`❌ [Firebird] Erro na tentativa ${attempt}:`, err.message);

            // Verifica se é um erro que vale a pena tentar novamente (rede/timeout)
            const isRetryable = ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'Timeout', 'Network'].some(
                msg => err.message.includes(msg) || (err.code && String(err.code).includes(msg))
            );

            if (!isRetryable) break;
        } finally {
            if (dbConn) {
                try {
                    dbConn.detach();
                } catch (e) {
                    console.warn('⚠️ Erro ao fechar conexão Firebird:', e.message);
                }
            }
        }
    }

    throw lastError;
}

// GET /api/pedidos-firebird/emissao-mensal
// Retorna o valor e peso total de pedidos emitidos por mês/ano
router.get('/emissao-mensal', async (req, res) => {
    try {
        console.log('📊 [API] Recebida requisição para histórico de emissão.');
        const { anoInicio } = req.query;
        const startYear = parseInt(anoInicio) || 2024;

        const query = `
            SELECT 
                EXTRACT(YEAR FROM p.EMISSAO_PED) as ANO,
                EXTRACT(MONTH FROM p.EMISSAO_PED) as MES,
                COUNT(p.CODIGO_PED) as TOTAL_PEDIDOS,
                SUM(p.TOTAL_PEDIDO_PED) as TOTAL_VALOR,
                SUM(COALESCE(p.PESO_LIQUIDO_PED, 0)) as TOTAL_PESO_LIQUIDO,
                SUM(COALESCE(p.PESO_BRUTO_PED, 0)) as TOTAL_PESO_BRUTO
            FROM PEDIDO p
            WHERE EXTRACT(YEAR FROM p.EMISSAO_PED) >= ${startYear}
              AND p.STATUS_PED <> 'C' 
            GROUP BY 1, 2
            ORDER BY 1 DESC, 2 DESC
        `;

        const result = await executeQuery(query);
        console.log(`✅ [API] Sucesso! ${result.length} registros encontrados.`);

        const dataFormatted = result.map(row => ({
            ano: row.ANO,
            mes: row.MES,
            totalPedidos: row.TOTAL_PEDIDOS,
            totalValor: row.TOTAL_VALOR,
            totalPeso: row.TOTAL_PESO_LIQUIDO,
            totalPesoBruto: row.TOTAL_PESO_BRUTO
        }));

        res.json(dataFormatted);

    } catch (error) {
        console.error('❌ [API] Erro ao buscar emissão:', error);
        res.status(500).json({ error: 'Erro ao conectar no banco de dados', details: error.message });
    }
});

// GET /api/pedidos-firebird/op-apontamentos
// Retorna o detalhamento de apontamentos de uma OP agrupado por setor (Busca do POSTGRES)
router.get('/op-apontamentos', async (req, res) => {
    try {
        const { op } = req.query;
        if (!op) {
            return res.status(400).json({ error: 'Número da OP é obrigatório' });
        }

        console.log(`📊 [API-POSTGRES] Buscando apontamentos para OP: ${op}`);

        // Query no Postgres para maior rapidez (dados sincronizados)
        const query = `
            SELECT 
                setor,
                SUM(quantidade) as quantidade,
                MAX(data_producao) as data
            FROM producao_apontada_sincronizada
            WHERE op = $1
            GROUP BY setor
            ORDER BY 1
        `;

        const result = await pool.query(query, [op]);

        console.log(`✅ [API-POSTGRES] OP ${op}: ${result.rows.length} setores encontrados.`);

        const dataFormatted = result.rows.map(row => ({
            setor: row.setor || 'DESCONHECIDO',
            quantidade: parseFloat(row.quantidade),
            data: row.data
        }));

        res.json(dataFormatted);

    } catch (error) {
        console.error('❌ [API-POSTGRES] Erro ao buscar apontamentos da OP:', error);
        res.status(500).json({ error: 'Erro ao buscar dados da OP no Postgres', details: error.message });
    }
});

// GET /api/pedidos-firebird/op-setor-detalhes
// Retorna o histórico de apontamentos (data/quantidade) de uma OP em setores específicos
router.get('/op-setor-detalhes', async (req, res) => {
    try {
        const { op, setores } = req.query;
        if (!op || !setores) {
            return res.status(400).json({ error: 'Número da OP e setores são obrigatórios' });
        }

        // Converte string de setores separada por vírgula em array se necessário
        const sectorList = Array.isArray(setores) ? setores : setores.split(',');

        console.log(`📊 [API-POSTGRES] Buscando histórico detalhado OP: ${op} em ${sectorList.length} setores.`);

        const query = `
            SELECT 
                data_producao,
                setor,
                quantidade
            FROM producao_apontada_sincronizada
            WHERE op = $1 AND setor = ANY($2)
            ORDER BY data_producao ASC, id ASC
        `;

        const result = await pool.query(query, [op, sectorList]);

        const dataFormatted = result.rows.map(row => ({
            data: row.data_producao,
            setor: row.setor,
            quantidade: parseFloat(row.quantidade)
        }));

        res.json(dataFormatted);

    } catch (error) {
        console.error('❌ [API-POSTGRES] Erro ao buscar histórico da OP:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico no Postgres', details: error.message });
    }
});

// GET /api/pedidos-firebird/op-apontamentos-resumo
// Retorna o resumo de todos os apontamentos por OP e Setor (Otimizado para Dashboard de Monitoramento)
router.get('/op-apontamentos-resumo', async (req, res) => {
    try {
        console.log('📊 [API-POSTGRES] Buscando resumo global de apontamentos...');

        const query = `
            SELECT 
                op,
                setor,
                SUM(quantidade) as quantidade,
                MIN(data_producao) as data_inicio,
                MAX(data_producao) as data_fim
            FROM producao_apontada_sincronizada
            WHERE op IS NOT NULL
            GROUP BY op, setor
        `;

        const result = await pool.query(query);

        // Agrupar por OP no objeto de retorno para facilitar o de/para no frontend
        const summary = {};
        result.rows.forEach(row => {
            if (!summary[row.op]) {
                summary[row.op] = {};
            }
            summary[row.op][row.setor] = {
                quantidade: parseFloat(row.quantidade),
                data_inicio: row.data_inicio,
                data_fim: row.data_fim
            };
        });

        console.log(`✅ [API-POSTGRES] Resumo gerado para ${Object.keys(summary).length} OPs.`);
        res.json(summary);

    } catch (error) {
        console.error('❌ [API-POSTGRES] Erro ao buscar resumo de apontamentos:', error);
        res.status(500).json({ error: 'Erro ao processar resumo no Postgres', details: error.message });
    }
});

// GET /api/pedidos-firebird/op-roteiro
// Retorna o roteiro de produção (sequência de setores) de um produto via Ficha Técnica
router.get('/op-roteiro', async (req, res) => {
    try {
        const { produto, cliente } = req.query;
        if (!produto) {
            return res.status(400).json({ error: 'Código do produto é obrigatório' });
        }

        console.log(`📊 [Firebird] Buscando roteiro para produto: ${produto}${cliente ? ` (Cliente: ${cliente})` : ''}`);

        // O PDT_CODIGO_FIC está em FICHA_TECNICA. Para achar o nome, join com PROCEDIMENTO. 
        // Para etapas, PROCEDIMENTO_SETOR. 
        // Filtramos por ATIVO_FIC = 'S' (usando TRIM para evitar problemas de CHAR).
        let query = `
            SELECT 
                PS.SEQUENCIA_PDS as "sequencia", 
                S.NOME_SET as "setor"
            FROM FICHA_TECNICA FT
            JOIN PROCEDIMENTO P ON P.CODIGO_PDT = FT.PDT_CODIGO_FIC
            JOIN PROCEDIMENTO_SETOR PS ON PS.PDT_CODIGO_PDS = P.CODIGO_PDT
            JOIN SETOR S ON S.CODIGO_SET = PS.SET_CODIGO_PDS
            WHERE (FT.PRO_CODIGO_FIC = ? OR TRIM(FT.PRO_CODIGO_FIC) = ?)
              AND TRIM(FT.ATIVO_FIC) = 'S'
              AND PS.SET_EMPRESA_PDS = 10
              AND S.NOME_SET NOT LIKE 'NAO USAR%'
        `;

        const params = [produto, produto.trim()];

        // Se tiver cliente, tenta filtrar por ele para ser mais específico
        if (cliente) {
            query += ` AND (FT.CLI_CODIGO_FIC = ? OR TRIM(FT.CLI_CODIGO_FIC) = ?) `;
            params.push(cliente, String(cliente).trim());
        }

        query += ` ORDER BY PS.SEQUENCIA_PDS `;

        const result = await executeQuery(query, params);

        console.log(`✅ [Firebird] Roteiro para ${produto}: ${Array.isArray(result) ? result.length : 0} etapas encontradas.`);
        
        if (Array.isArray(result) && result.length === 0) {
            console.warn(`⚠️ [Firebird] Roteiro vazio para produto ${produto}. Verificando sem filtro ATIVO_FIC...`);
            // Tentativa secundária sem o filtro ATIVO_FIC ou com TRIM avançado?
        }

        if (!Array.isArray(result)) {
            console.error('❌ [Firebird] Resultado inesperado (não é array):', result);
            return res.json([]);
        }

        const dataFormatted = result.map(row => ({
            // Tenta tanto minúsculo quanto maiúsculo para ser robusto
            sequencia: row.sequencia || row.SEQUENCIA || row.SEQUENCIA_FTPC,
            setor: (row.setor || row.SETOR || row.NOME_SET || 'DESCONHECIDO').trim().toUpperCase()
        }));

        res.json(dataFormatted);

    } catch (error) {
        console.error('❌ [Firebird] Erro ao buscar roteiro:', error);
        res.status(500).json({ error: 'Erro ao buscar roteiro no Firebird', details: error.message });
    }
});

module.exports = router;
