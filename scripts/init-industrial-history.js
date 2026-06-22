// scripts/init-industrial-history.js
require('dotenv').config({ path: '.env.local' });
const pool = require('../lib/db');

async function init() {
    console.log('🚀 Reinicializando tabela industrial_snapshots com todos os setores...');
    
    try {
        // Vamos dropar se já existir para simplificar a migração completa dos 8 setores
        await pool.query(`DROP TABLE IF EXISTS industrial_snapshots;`);

        await pool.query(`
            CREATE TABLE industrial_snapshots (
                id SERIAL PRIMARY KEY,
                snapshot_date DATE UNIQUE NOT NULL,
                
                aguardando_qty NUMERIC DEFAULT 0,
                aguardando_weight NUMERIC DEFAULT 0,
                aguardando_value NUMERIC DEFAULT 0,
                
                moldagem_qty NUMERIC DEFAULT 0,
                moldagem_weight NUMERIC DEFAULT 0,
                moldagem_value NUMERIC DEFAULT 0,
                
                fusao_qty NUMERIC DEFAULT 0,
                fusao_weight NUMERIC DEFAULT 0,
                fusao_value NUMERIC DEFAULT 0,
                
                acabamento_qty NUMERIC DEFAULT 0,
                acabamento_weight NUMERIC DEFAULT 0,
                acabamento_value NUMERIC DEFAULT 0,
                
                tt_qty NUMERIC DEFAULT 0,
                tt_weight NUMERIC DEFAULT 0,
                tt_value NUMERIC DEFAULT 0,
                
                usinagem_qty NUMERIC DEFAULT 0,
                usinagem_weight NUMERIC DEFAULT 0,
                usinagem_value NUMERIC DEFAULT 0,
                
                qualidade_qty NUMERIC DEFAULT 0,
                qualidade_weight NUMERIC DEFAULT 0,
                qualidade_value NUMERIC DEFAULT 0,
                
                expedicao_qty NUMERIC DEFAULT 0,
                expedicao_weight NUMERIC DEFAULT 0,
                expedicao_value NUMERIC DEFAULT 0,
                
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX idx_industrial_snapshots_date ON industrial_snapshots(snapshot_date);
        `);
        
        console.log('✅ Tabela industrial_snapshots recriada com sucesso (8 setores)!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Erro ao recriar tabela:', err);
        process.exit(1);
    }
}

init();
