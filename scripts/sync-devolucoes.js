// scripts/sync-devolucoes.js
// Script de Sincronização de Devoluções: Firebird → PostgreSQL
// Filtra por FINALIDADE_NOT = 4 e anos 2025/2026

const Firebird = require('node-firebird');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');

const firebirdOptions = {
    host: '10.1.1.100',
    port: 3050,
    database: '/home/lm/LM-Sistemas/SIGE2.0/Dados/sige.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    pageSize: 4096
};

function formatarData(data) {
    if (!data) return null;
    const d = new Date(data);
    return d.toISOString().split('T')[0];
}

async function sincronizar() {
    console.log('🚀 Iniciando sincronização de Devoluções...');

    // 1. Criar Tabela no Postgres
    await pool.query(`
        CREATE TABLE IF NOT EXISTS firebird_sync_devolucoes (
            id SERIAL PRIMARY KEY,
            nota_fiscal INTEGER,
            serie VARCHAR(10),
            item_nota INTEGER,
            data_entrada DATE,
            cliente_codigo VARCHAR(20),
            cliente_nome VARCHAR(255),
            codigo_item VARCHAR(50),
            descricao VARCHAR(255),
            quantidade DECIMAL(15,3),
            valor_unitario DECIMAL(15,2),
            valor_total DECIMAL(15,2),
            peso_un DECIMAL(15,3),
            peso_total DECIMAL(15,3),
            motivo TEXT,
            codigo_not INTEGER,
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(nota_fiscal, serie, item_nota, codigo_item)
        )
    `);

    // Migração: Adicionar coluna se não existir
    await pool.query('ALTER TABLE firebird_sync_devolucoes ADD COLUMN IF NOT EXISTS codigo_not INTEGER');

    Firebird.attach(firebirdOptions, (err, db) => {
        if (err) {
            console.error('❌ Erro ao conectar ao Firebird:', err);
            process.exit(1);
        }

        const dataInicio = new Date();
        dataInicio.setDate(dataInicio.getDate() - 90);
        const dataInicioStr = dataInicio.toISOString().split('T')[0];
        console.log(`📅 Janela de Sincronização: ${dataInicioStr} até hoje.`);

        const query = `
            SELECT 
                d.CODIGO_DEV as NOTA_FISCAL,
                CAST(d.DATA_DEV AS DATE) as DATA_ENTRADA,
                d.CLIENTE_DEV as CLIENTE_CODIGO,
                c.RAZAO_SOCIAL_CLI as CLIENTE_NOME,
                dp.PRODUTO_DEP as CODIGO_ITEM,
                dp.ITEM_DEP as ITEM_DEV,
                dp.NOME_PRODUTO_DEP as DESCRICAO,
                dp.QUANTIDADE_DEP as QUANTIDADE,
                dp.PRECO_DEP as VALOR_UNITARIO,
                (dp.QUANTIDADE_DEP * dp.PRECO_DEP) as VALOR_TOTAL,
                p.PESO_LIQUIDO_PRO as PESO_UN,
                (dp.QUANTIDADE_DEP * COALESCE(p.PESO_LIQUIDO_PRO, 0)) as PESO_TOTAL,
                d.OBSERVACAO_DEV as MOTIVO,
                d.CODIGO_DEV
            FROM DEVOLUCAO d
            INNER JOIN DEVOLUCAO_PRODUTO dp 
                ON d.EMPRESA_DEV = dp.EMPRESA_DEP 
                AND d.CODIGO_DEV = dp.CODIGO_DEP
            LEFT JOIN CLIENTE c
                ON d.CLIENTE_DEV = c.CODIGO_CLI
            LEFT JOIN PRODUTO p
                ON dp.PRODUTO_DEP = p.CODIGO_PRO
            WHERE d.STATUS_DEV <> 'C'
                AND dp.STATUS_DEP <> 'C'
                AND d.DATA_DEV >= ?
            ORDER BY d.DATA_DEV DESC
        `;

        db.query(query, [dataInicio], async (err, result) => {
            if (err) {
                console.error('❌ Erro na consulta Firebird:', err);
                db.detach();
                process.exit(1);
            }

            console.log(`📦 Encontrados ${result.length} registros de devolução.`);

            try {
                let inserted = 0;
                for (const row of result) {
                    await pool.query(`
                        INSERT INTO firebird_sync_devolucoes (
                            nota_fiscal, serie, item_nota, data_entrada, cliente_codigo, 
                            cliente_nome, codigo_item, descricao, quantidade, valor_unitario, 
                            valor_total, peso_un, peso_total, motivo, codigo_not
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                        ON CONFLICT (nota_fiscal, serie, item_nota, codigo_item) DO UPDATE SET
                            cliente_nome = EXCLUDED.cliente_nome,
                            quantidade = EXCLUDED.quantidade,
                            valor_total = EXCLUDED.valor_total,
                            peso_total = EXCLUDED.peso_total,
                            atualizado_em = CURRENT_TIMESTAMP
                    `, [
                        row.NOTA_FISCAL,
                        '', // Série não presente na tabela DEVOLUCAO
                        row.ITEM_DEV, // Usando ITEM_DEP para garantir unicidade do registro
                        formatarData(row.DATA_ENTRADA),
                        row.CLIENTE_CODIGO,
                        row.CLIENTE_NOME ? String(row.CLIENTE_NOME).trim() : 'Cliente não identificado',
                        row.CODIGO_ITEM,
                        row.DESCRICAO ? String(row.DESCRICAO).trim() : '',
                        row.QUANTIDADE,
                        row.VALOR_UNITARIO,
                        row.VALOR_TOTAL,
                        row.PESO_UN,
                        row.PESO_TOTAL,
                        row.MOTIVO ? String(row.MOTIVO).trim() : '',
                        row.CODIGO_DEV
                    ]);

                    inserted++;
                    if (inserted % 50 === 0 || inserted === result.length) {
                        const pct = ((inserted / result.length) * 100).toFixed(0);
                        process.stdout.write(`@PROG:DEVOLUÇÕES:${pct}%\n`);
                    }
                }

                // ATUALIZAR STATUS DE SINCRONIZAÇÃO
                try {
                    await pool.query("SET TIME ZONE 'America/Sao_Paulo'");
                    await pool.query(`
                        INSERT INTO sync_status (screen_name, last_sync_at)
                        VALUES ('Devoluções', NOW())
                        ON CONFLICT (screen_name) DO UPDATE SET last_sync_at = NOW();
                    `);
                    console.log('📊 Status de sincronização atualizado para: Devoluções');
                } catch (statusErr) {
                    console.error('⚠️ Erro ao atualizar status de sincronização:', statusErr.message);
                }
            } catch (pgErr) {
                console.error('❌ Erro ao salvar no Postgres:', pgErr);
            } finally {
                db.detach();
                process.exit(0);
            }
        });
    });
}

sincronizar();
