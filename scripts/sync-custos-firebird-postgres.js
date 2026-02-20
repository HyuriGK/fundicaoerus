require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const Firebird = require('node-firebird');
const pool = require('../lib/db');

const FIREBIRD_OPTIONS = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

async function createTableIfNotExists() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS custos_detalhados (
                id SERIAL PRIMARY KEY,
                categoria VARCHAR(50) NOT NULL,
                nome VARCHAR(255) NOT NULL,
                total NUMERIC(15,2) DEFAULT 0,
                atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Criar índices para performance
            CREATE INDEX IF NOT EXISTS idx_custos_categoria ON custos_detalhados(categoria);
        `);
        console.log('✅ Tabela custos_detalhados verificada/criada no Postgres.');
    } catch (error) {
        console.error('❌ Erro ao criar tabela no Postgres:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function syncData() {
    console.log(`\n🚀 Iniciando sincronização de Custos (Firebird -> Postgres) - ${new Date().toLocaleString()}`);

    await createTableIfNotExists();

    const dbFb = await new Promise((resolve, reject) => {
        let retries = 0;
        const connect = () => {
            Firebird.attach(FIREBIRD_OPTIONS, (err, db) => {
                if (err) {
                    if (retries < 3) {
                        retries++;
                        console.warn(`⏳ Falha ao conectar no Firebird. Tentativa ${retries}/3...`);
                        setTimeout(connect, 2000);
                    } else {
                        reject(err);
                    }
                } else {
                    resolve(db);
                }
            });
        };
        connect();
    });

    console.log('✅ Conectado ao Firebird com sucesso.');

    const queries = {
        fornecedores: `
            SELECT FIRST 20 
                COALESCE(FORN.RAZAO_SOCIAL_FRN, 'DESCONHECIDO') AS NOME,
                SUM(C.TOTAL_PRODUTOS_COM) AS TOTAL
            FROM COMPRA C
            LEFT JOIN FORNECEDOR FORN ON C.FORNECEDOR_COM = FORN.FOR_CODIGO_FRN
            WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026)
            GROUP BY 1
            ORDER BY 2 DESC
        `,
        tipos: `
            SELECT FIRST 20 
                COALESCE(DES.NOME_DES, 'NAO CATEGORIZADO') AS NOME,
                SUM(C.TOTAL_PRODUTOS_COM) AS TOTAL
            FROM COMPRA C
            LEFT JOIN DESPESA DES ON C.DESPESA_COM = DES.CODIGO_DES
            WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026)
            GROUP BY 1
            ORDER BY 2 DESC
        `,
        setores: `
            SELECT FIRST 20 
                COALESCE(CC.NOME_CTU, 'GERAL / NAO ALOCADO') AS NOME,
                SUM(PAG.VALOR_PARCELA_PAG) AS TOTAL
            FROM PAGAR PAG
            LEFT JOIN CENTRO_CUSTO CC ON PAG.CTU_CODIGO_PAG = CC.CODIGO_CTU
            WHERE PAG.ANO_PAG IN (2025, 2026)
            GROUP BY 1
            ORDER BY 2 DESC
        `,
        materiais: `
            SELECT FIRST 20 
                COALESCE(PRO.NOME_PRO, 'DIVERSOS') AS NOME,
                SUM(CP.VALOR_PRODUTOS_CPR) AS TOTAL
            FROM COMPRA_PRODUTO CP
            JOIN COMPRA C ON CP.COM_ID_CPR = C.ID_COM
            LEFT JOIN PRODUTO PRO ON CP.PRODUTO_CPR = PRO.CODIGO_PRO
            WHERE EXTRACT(YEAR FROM C.EMISSAO_COM) IN (2025, 2026)
            GROUP BY 1
            ORDER BY 2 DESC
        `
    };

    const fetchFbData = (q, name) => {
        return new Promise((resolve) => {
            dbFb.query(q, (err, res) => {
                if (err) {
                    console.error(`❌ Erro ao buscar ${name} no Firebird:`, err.message);
                    resolve([]);
                } else {
                    resolve(res || []);
                }
            });
        });
    };

    try {
        console.log('📥 Extraindo dados do Firebird (sequencial para evitar locks)...');
        const dados = {
            fornecedores: await fetchFbData(queries.fornecedores, 'Fornecedores'),
            tipos: await fetchFbData(queries.tipos, 'Tipos'),
            setores: await fetchFbData(queries.setores, 'Setores'),
            materiais: await fetchFbData(queries.materiais, 'Materiais')
        };

        dbFb.detach();
        console.log('✅ Extração concluída. Fechando conexão Firebird.');

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Limpa tabela atual para substituir pelos dados calcados
            await client.query('TRUNCATE TABLE custos_detalhados');

            let inseridos = 0;

            // Inserir Fornecedores
            for (const row of dados.fornecedores) {
                await client.query(`INSERT INTO custos_detalhados (categoria, nome, total) VALUES ('fornecedores', $1, $2)`, [row.NOME, row.TOTAL || 0]);
                inseridos++;
            }

            // Inserir Tipos
            for (const row of dados.tipos) {
                await client.query(`INSERT INTO custos_detalhados (categoria, nome, total) VALUES ('tipos', $1, $2)`, [row.NOME, row.TOTAL || 0]);
                inseridos++;
            }

            // Inserir Setores
            for (const row of dados.setores) {
                await client.query(`INSERT INTO custos_detalhados (categoria, nome, total) VALUES ('setores', $1, $2)`, [row.NOME, row.TOTAL || 0]);
                inseridos++;
            }

            // Inserir Materiais
            for (const row of dados.materiais) {
                await client.query(`INSERT INTO custos_detalhados (categoria, nome, total) VALUES ('materiais', $1, $2)`, [row.NOME, row.TOTAL || 0]);
                inseridos++;
            }

            await client.query('COMMIT');
            console.log(`✅ Sincronização concluída com sucesso! ${inseridos} registros atualizados no Postgres.`);

        } catch (dbErr) {
            await client.query('ROLLBACK');
            throw dbErr;
        } finally {
            client.release();
        }

    } catch (e) {
        console.error('❌ Erro inesperado durante as transações:', e);
    }
}

// Execução
syncData()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Finalizou com erro fatal:', err);
        process.exit(1);
    });
