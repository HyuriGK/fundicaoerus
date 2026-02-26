
// Script: sync-refugos-firebird-postgres.js
// Sincroniza dados de REFUGO (PRODUCAO_SETOR) para PostgreSQL
// Adiciona informação de CLIENTE via PRODUCAO -> PEDIDO ou NOTA_FISCAL

require('dotenv').config({ path: '.env.local' });
const Firebird = require('node-firebird');
const pool = require('../lib/db');

const fbOptions = {
    host: '10.1.1.100', port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA', password: 'masterkey',
    lowercase_keys: false, pageSize: 4096
};

function cleanString(str) {
    if (!str) return '';
    return str.toString().trim().replace(/['"\\\b\f\n\r\t]/g, '');
}

function parseDate(fbDate) {
    if (!fbDate) return null;
    return new Date(fbDate);
}

function chunkArray(myArray, chunk_size) {
    var index = 0;
    var arrayLength = myArray.length;
    var tempArray = [];
    for (index = 0; index < arrayLength; index += chunk_size) {
        tempArray.push(myArray.slice(index, index + chunk_size));
    }
    return tempArray;
}

async function startSync() {
    console.log('🚀 Iniciando Sincronismo de Refugos...');

    Firebird.attach(fbOptions, async (err, db) => {
        if (err) { console.error(err); process.exit(1); }

        try {
            // 1. Setup Postgres Table
            await pool.query(`CREATE TABLE IF NOT EXISTS refugo_apontado_sincronizado (
                id SERIAL PRIMARY KEY,
                chave_origem VARCHAR(100) UNIQUE,
                data_refugo DATE,
                setor VARCHAR(100),
                cliente VARCHAR(255),
                op VARCHAR(50),
                codigo_peca VARCHAR(50),
                produto_descricao TEXT,
                peso_un DECIMAL(15,3),
                quantidade DECIMAL(15,3),
                peso_total DECIMAL(15,3),
                motivo VARCHAR(100),
                lote VARCHAR(100),
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);
            await pool.query('DELETE FROM refugo_apontado_sincronizado');

            // 2. Fetch Refugos (PCS with REF_CODIGO)
            const queryRefugos = `
                SELECT 
                    ID_PCS, CODIGO_PCS, SETOR_PCS, REF_CODIGO_PCS, DATA_PCS, 
                    DQUANTIDADE_REFUGO_PCS as QUANTIDADE, LOTE_PCS,
                    NOTA_NFE_PCS, SERIE_NFE_PCS
                FROM PRODUCAO_SETOR 
                WHERE DATA_PCS >= '2025-01-01' AND REF_CODIGO_PCS IS NOT NULL AND DQUANTIDADE_REFUGO_PCS > 0
            `;

            db.query(queryRefugos, async (err, rows) => {
                if (err) throw err;
                console.log(`📦 Registros de refugo encontrados: ${rows.length}`);

                // 3. Lookups
                const opIds = [...new Set(rows.map(r => r.CODIGO_PCS).filter(id => id))];
                const setIds = [...new Set(rows.map(r => r.SETOR_PCS).filter(id => id))];
                const refIds = [...new Set(rows.map(r => r.REF_CODIGO_PCS).filter(id => id))];
                const nfeIds = [...new Set(rows.map(r => r.NOTA_NFE_PCS).filter(id => id))];

                const lookupSET = {};
                const lookupREF = {};
                const lookupPRODUCAO = {};
                const lookupPEDIDO = {};
                const lookupCLIENTE = {};
                const lookupNOTA = {};
                const lookupPRODUTO = {};

                const fetchMap = async (ids, table, pk, cols, targetMap) => {
                    if (ids.length === 0) return;
                    const chunks = chunkArray(ids, 500);
                    for (const chunk of chunks) {
                        const q = `SELECT ${pk}, ${cols} FROM ${table} WHERE ${pk} IN(${chunk.join(',')})`;
                        await new Promise((resolve, reject) => {
                            db.query(q, (err, res) => {
                                if (err) return reject(err);
                                res.forEach(r => { targetMap[String(r[pk]).trim()] = r; });
                                resolve();
                            });
                        });
                    }
                };

                await fetchMap(setIds, 'SETOR', 'CODIGO_SET', 'NOME_SET', lookupSET);
                await fetchMap(refIds, 'REFUGO', 'CODIGO_REF', 'NOME_REF', lookupREF);

                // OP -> PRODUCAO -> PEDIDO -> CLIENTE
                await fetchMap(opIds, 'PRODUCAO', 'CODIGO_PCP', 'PRODUTO_PCP, PEDIDO_PCP, ANO_PCP, EMPRESA_PCP', lookupPRODUCAO);

                // Fetch PEDIDO with composite key search support
                const peds = [...new Set(Object.values(lookupPRODUCAO).map(p => p.PEDIDO_PCP).filter(id => id))];
                if (peds.length > 0) {
                    const chunks = chunkArray(peds, 500);
                    for (const chunk of chunks) {
                        const q = `SELECT CODIGO_PED, ANO_PED, EMPRESA_PED, CLIENTE_PED FROM PEDIDO WHERE CODIGO_PED IN(${chunk.join(',')})`;
                        await new Promise((resolve, reject) => {
                            db.query(q, (err, res) => {
                                if (err) return resolve();
                                res.forEach(r => {
                                    const key = `${String(r.CODIGO_PED).trim()}|${String(r.ANO_PED).trim()}|${String(r.EMPRESA_PED).trim()}`;
                                    lookupPEDIDO[key] = r;
                                });
                                resolve();
                            });
                        });
                    }
                }

                const cliIds = [...new Set(Object.values(lookupPEDIDO).map(p => p.CLIENTE_PED).filter(id => id))];
                await fetchMap(cliIds, 'CLIENTE', 'CODIGO_CLI', 'RAZAO_SOCIAL_CLI', lookupCLIENTE);

                // FALLBACK: NOTA_FISCAL
                if (nfeIds.length > 0) {
                    const chunks = chunkArray(nfeIds, 500);
                    for (const chunk of chunks) {
                        const q = `SELECT CODIGO_NOT, SERIE_NOT, RAZAO_SOCIAL_NOT FROM NOTA_FISCAL WHERE CODIGO_NOT IN(${chunk.join(',')})`;
                        await new Promise((resolve, reject) => {
                            db.query(q, (err, res) => {
                                if (err) return resolve();
                                res.forEach(r => {
                                    const key = `${String(r.CODIGO_NOT).trim()}|${String(r.SERIE_NOT).trim()}`;
                                    lookupNOTA[key] = r;
                                });
                                resolve();
                            });
                        });
                    }
                }

                const prodIds = [...new Set(Object.values(lookupPRODUCAO).map(p => p.PRODUTO_PCP).filter(id => id))];
                await fetchMap(prodIds, 'PRODUTO', 'CODIGO_PRO', 'NOME_PRO, PESO_LIQUIDO_PRO', lookupPRODUTO);

                console.log('✅ Lookups concluídos. Inserindo no Postgres...');

                let inserted = 0;
                for (const row of rows) {
                    try {
                        const opId = String(row.CODIGO_PCS || '').trim();
                        const prod = lookupPRODUCAO[opId] || {};
                        const pedKey = `${String(prod.PEDIDO_PCP || '').trim()}|${String(prod.ANO_PCP || '').trim()}|${String(prod.EMPRESA_PCP || '').trim()}`;
                        const ped = lookupPEDIDO[pedKey] || {};
                        const cli = lookupCLIENTE[String(ped.CLIENTE_PED || '').trim()] || {};

                        let clienteName = cleanString(cli.RAZAO_SOCIAL_CLI);
                        if (!clienteName || clienteName === '-') {
                            const nfeKey = `${String(row.NOTA_NFE_PCS || '').trim()}|${String(row.SERIE_NFE_PCS || '').trim()}`;
                            const nfe = lookupNOTA[nfeKey] || {};
                            clienteName = cleanString(nfe.RAZAO_SOCIAL_NOT);
                        }
                        if (!clienteName) clienteName = '-';

                        const item = lookupPRODUTO[String(prod.PRODUTO_PCP || '').trim()] || {};
                        const setor = lookupSET[String(row.SETOR_PCS).trim()] || {};
                        const motivo = lookupREF[String(row.REF_CODIGO_PCS).trim()] || {};

                        const pesoUn = parseFloat(item.PESO_LIQUIDO_PRO) || 0;
                        const quant = parseFloat(row.QUANTIDADE) || 0;

                        await pool.query(`
                            INSERT INTO refugo_apontado_sincronizado 
                            (chave_origem, data_refugo, setor, cliente, op, codigo_peca, produto_descricao, peso_un, quantidade, peso_total, motivo, lote)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                        `, [
                            `REF-PCS-${row.ID_PCS}`,
                            row.DATA_PCS,
                            cleanString(setor.NOME_SET) || 'DESCONHECIDO',
                            clienteName,
                            opId,
                            String(prod.PRODUTO_PCP || '-'),
                            cleanString(item.NOME_PRO) || '-',
                            pesoUn,
                            quant,
                            pesoUn * quant,
                            cleanString(motivo.NOME_REF) || 'N/I',
                            cleanString(row.LOTE_PCS)
                        ]);
                        inserted++;
                        if (inserted % 100 === 0) console.log(`  ⏳ Processados: ${inserted}/${rows.length}`);
                    } catch (e) {
                        console.error(`  ❌ Erro no registro ${row.ID_PCS}:`, e.message);
                    }
                }

                console.log('✅ Sincronismo concluído com sucesso!');
                db.detach();
                await pool.end();
                process.exit(0);
            });

        } catch (e) {
            console.error('❌ Erro fatal:', e);
            db.detach();
            process.exit(1);
        }
    });
}

startSync();
