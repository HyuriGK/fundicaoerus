// Script: sync-refugos-firebird-postgres.js
// Sincroniza dados de REFUGO (PRODUCAO_SETOR) para PostgreSQL
// Hierarquia de Cliente: NOTA_FISCAL -> PEDIDO -> PRODUTO

const pool = require('../lib/db');
const { Firebird, options: fbOptions } = require('../lib/firebird-helper');

// Funções Utilitárias
const firebirdQuery = (db, query, params = []) => {
    return new Promise((resolve, reject) => {
        db.query(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const cleanString = (str) => {
    if (!str) return '';
    return str.toString().trim().replace(/['"\\\b\f\n\r\t]/g, '');
};

const chunkArray = (myArray, chunk_size) => {
    var index = 0;
    var arrayLength = myArray.length;
    var tempArray = [];
    for (index = 0; index < arrayLength; index += chunk_size) {
        tempArray.push(myArray.slice(index, index + chunk_size));
    }
    return tempArray;
};

async function startSync() {
    console.log('🚀 Iniciando Sincronismo de Refugos (v2 - Triple Lookup)...');

    let db;
    try {
        db = await new Promise((resolve, reject) => {
            Firebird.attach(fbOptions, (err, db) => {
                if (err) reject(err);
                else resolve(db);
            });
        });

        console.log('✅ Conectado ao Firebird.');

        // 1. Preparar Tabela Postgres
        await pool.query(`DROP TABLE IF EXISTS refugo_apontado_sincronizado`);
        await pool.query(`CREATE TABLE refugo_apontado_sincronizado (
            id SERIAL PRIMARY KEY,
            chave_origem VARCHAR(100) UNIQUE,
            data_refugo DATE,
            setor VARCHAR(100),
            cliente VARCHAR(255),
            op VARCHAR(50),
            codigo_peca VARCHAR(50),
            produto TEXT,
            peso_un DECIMAL(15,3),
            quantidade DECIMAL(15,3),
            peso_total DECIMAL(15,3),
            motivo VARCHAR(100),
            lote VARCHAR(100),
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log('✅ Tabela refugo_apontado_sincronizado recriada.');

        // 2. Buscar Refugos no Firebird (Janela Incremental de 90 dias)
        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - 90);
        const dataInicioStr = dataInicio.toISOString().split('T')[0];
        console.log(`📅 Janela de Sincronização: ${dataInicioStr} até hoje.`);

        const queryRefugos = `
            SELECT 
                ID_PCS, EMPRESA_PCS, CODIGO_PCS, SETOR_PCS, REF_CODIGO_PCS, DATA_PCS, 
                DQUANTIDADE_REFUGO_PCS as QUANTIDADE, LOTE_PCS,
                NOTA_NFE_PCS, SERIE_NFE_PCS
            FROM PRODUCAO_SETOR 
            WHERE DATA_PCS >= ? AND REF_CODIGO_PCS IS NOT NULL AND DQUANTIDADE_REFUGO_PCS > 0
            ORDER BY DATA_PCS DESC
        `;
        const rows = await firebirdQuery(db, queryRefugos, [dataInicio]);
        console.log(`📦 Encontrados ${rows.length} registros de refugo no Firebird.`);

        if (rows.length === 0) {
            console.log('⚠️ Nenhum registro novo para sincronizar.');
            db.detach();
            process.exit(0);
        }

        // 3. Preparar Lookups para Performance
        const opIds = [...new Set(rows.map(r => r.CODIGO_PCS).filter(id => id))];
        const setIds = [...new Set(rows.map(r => r.SETOR_PCS).filter(id => id))];
        const refIds = [...new Set(rows.map(r => r.REF_CODIGO_PCS).filter(id => id))];
        const nfeIds = [...new Set(rows.map(r => r.NOTA_NFE_PCS).filter(id => id))];

        const lookupSET = {};
        const lookupREF = {};
        const lookupPRODUCAO = {};
        const lookupPEDIDO = {};
        const lookupPRODUTO = {};
        const lookupCLIENTE = {};
        const lookupNOTA = {};

        // Helper para preencher Mapas com chunks (Suporte a strings e números)
        const fillMap = async (ids, table, pk, cols, targetMap, isComposite = false) => {
            if (ids.length === 0) return;
            const chunks = chunkArray(ids, 500);
            for (const chunk of chunks) {
                const quotedIds = chunk.map(id => typeof id === 'string' ? `'${id}'` : id).join(',');
                const q = `SELECT ${pk}, ${cols} FROM ${table} WHERE ${pk} IN(${quotedIds})`;
                const res = await firebirdQuery(db, q);
                res.forEach(r => {
                    if (isComposite === 'PRODUCAO') {
                        const key = `${String(r.EMPRESA_PCP).trim()}|${String(r.CODIGO_PCP).trim()}`;
                        targetMap[key] = r;
                    } else if (isComposite === 'PEDIDO') {
                        const key = `${String(r.EMPRESA_PED).trim()}|${String(r.ANO_PED).trim()}|${String(r.CODIGO_PED).trim()}`;
                        targetMap[key] = r;
                    } else if (isComposite === 'NOTA_FISCAL') {
                        const key = `${String(r.CODIGO_NOT).trim()}|${String(r.SERIE_NOT).trim()}`;
                        targetMap[key] = r;
                    } else {
                        targetMap[String(r[pk]).trim()] = r;
                    }
                });
            }
        };

        console.log('⏳ Carregando Tabelas Auxiliares (Lookups)...');
        await fillMap(setIds, 'SETOR', 'CODIGO_SET', 'NOME_SET', lookupSET);
        await fillMap(refIds, 'REFUGO', 'CODIGO_REF', 'NOME_REF', lookupREF);

        // Lookup Produção (Chave Composta)
        await fillMap(opIds, 'PRODUCAO', 'CODIGO_PCP', 'CODIGO_PCP, EMPRESA_PCP, PRODUTO_PCP, PEDIDO_PCP, ANO_PCP', lookupPRODUCAO, 'PRODUCAO');

        // Lookup Pedidos
        const pedIds = [...new Set(Object.values(lookupPRODUCAO).map(p => p.PEDIDO_PCP).filter(id => id))];
        await fillMap(pedIds, 'PEDIDO', 'CODIGO_PED', 'CODIGO_PED, ANO_PED, EMPRESA_PED, CLIENTE_PED', lookupPEDIDO, 'PEDIDO');

        // Lookup Produtos
        const prodIds = [...new Set(Object.values(lookupPRODUCAO).map(p => p.PRODUTO_PCP).filter(id => id))];
        await fillMap(prodIds, 'PRODUTO', 'CODIGO_PRO', 'CODIGO_PRO, NOME_PRO, PESO_LIQUIDO_PRO, CLIENTE_PRO', lookupPRODUTO);

        // Lookup Notas Fiscais (Fallback)
        await fillMap(nfeIds, 'NOTA_FISCAL', 'CODIGO_NOT', 'CODIGO_NOT, SERIE_NOT, RAZAO_SOCIAL_NOT', lookupNOTA, 'NOTA_FISCAL');

        // Lookup Clientes (Última camada - Consolida todos os IDs de clientes encontrados)
        const cliIds = [...new Set([
            ...Object.values(lookupPEDIDO).map(p => p.CLIENTE_PED),
            ...Object.values(lookupPRODUTO).map(p => p.CLIENTE_PRO)
        ].filter(id => id))];
        await fillMap(cliIds, 'CLIENTE', 'CODIGO_CLI', 'CODIGO_CLI, RAZAO_SOCIAL_CLI', lookupCLIENTE);

        console.log('✅ Lookups concluídos. Iniciando Inserção...');

        let inserted = 0;
        for (const row of rows) {
            try {
                let clienteNome = '-';

                const prodKey = `${String(row.EMPRESA_PCS).trim()}|${String(row.CODIGO_PCS).trim()}`;
                const prod = lookupPRODUCAO[prodKey] || {};
                const item = lookupPRODUTO[String(prod.PRODUTO_PCP || '').trim()] || {};

                // 1. Prioridade: Nota Fiscal na Linha do Refugo
                const nfeKey = `${String(row.NOTA_NFE_PCS || '').trim()}|${String(row.SERIE_NFE_PCS || '').trim()}`;
                const nfe = lookupNOTA[nfeKey];
                if (nfe && nfe.RAZAO_SOCIAL_NOT) {
                    clienteNome = cleanString(nfe.RAZAO_SOCIAL_NOT);
                }

                // 2. Prioridade: Pedido Vinculado
                if ((!clienteNome || clienteNome === '-') && prod.PEDIDO_PCP) {
                    const pedKey = `${String(prod.EMPRESA_PCP).trim()}|${String(prod.ANO_PCP).trim()}|${String(prod.PEDIDO_PCP).trim()}`;
                    const ped = lookupPEDIDO[pedKey] || {};
                    const cli = lookupCLIENTE[String(ped.CLIENTE_PED || '').trim()] || {};
                    if (cli.RAZAO_SOCIAL_CLI) clienteNome = cleanString(cli.RAZAO_SOCIAL_CLI);
                }

                // 3. Prioridade: Cliente do Cadastro do Produto (Itens Dedicados)
                if ((!clienteNome || clienteNome === '-') && item.CLIENTE_PRO) {
                    const cli = lookupCLIENTE[String(item.CLIENTE_PRO).trim()] || {};
                    if (cli.RAZAO_SOCIAL_CLI) clienteNome = cleanString(cli.RAZAO_SOCIAL_CLI);
                }

                const setor = lookupSET[String(row.SETOR_PCS).trim()] || {};
                const motivo = lookupREF[String(row.REF_CODIGO_PCS).trim()] || {};

                const pesoUn = parseFloat(item.PESO_LIQUIDO_PRO) || 0;
                const quant = parseFloat(row.QUANTIDADE) || 0;

                await pool.query(`
                    INSERT INTO refugo_apontado_sincronizado 
                    (chave_origem, data_refugo, setor, cliente, op, codigo_peca, produto, peso_un, quantidade, peso_total, motivo, lote)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    ON CONFLICT (chave_origem) DO UPDATE SET
                        cliente = EXCLUDED.cliente,
                        peso_total = EXCLUDED.peso_total,
                        produto = EXCLUDED.produto,
                        atualizado_em = CURRENT_TIMESTAMP
                `, [
                    `REF-PCS-${row.ID_PCS}`,
                    row.DATA_PCS,
                    cleanString(setor.NOME_SET) || 'N/I',
                    clienteNome || '-',
                    String(row.CODIGO_PCS),
                    String(prod.PRODUTO_PCP || '-'),
                    cleanString(item.NOME_PRO) || '-',
                    pesoUn,
                    quant,
                    pesoUn * quant,
                    cleanString(motivo.NOME_REF) || 'N/I',
                    cleanString(row.LOTE_PCS)
                ]);
                inserted++;
                if (inserted % 100 === 0 || inserted === rows.length) {
                    const pct = ((inserted / rows.length) * 100).toFixed(0);
                    process.stdout.write(`@PROG:REFUGOS:${pct}%\n`);
                }
            } catch (err) {
                console.error(`  ❌ Erro no Registro ${row.ID_PCS}:`, err.message);
            }
        }

        console.log(`\n🎉 Sincronização Finalizada: ${inserted} registros inseridos/atualizados.`);

        // ATUALIZAR STATUS DE SINCRONIZAÇÃO
        try {
            await pool.query("SET TIME ZONE 'America/Sao_Paulo'");
            await pool.query(`
                INSERT INTO sync_status (screen_name, last_sync_at)
                VALUES ('Refugos', NOW())
                ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
            `);
            console.log('📊 Status de sincronização atualizado para: Refugos');
        } catch (statusErr) {
            console.error('⚠️ Erro ao atualizar status de sincronização:', statusErr.message);
        }
        db.detach();
        process.exit(0);

    } catch (err) {
        console.error('❌ ERRO NO SINCRONISMO:', err);
        if (db) db.detach();
        process.exit(1);
    }
}

startSync();
