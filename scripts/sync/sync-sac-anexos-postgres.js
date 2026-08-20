const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const pool = require('../../lib/db');
const ROOT = '\\\\10.1.1.100\\01\\LM-Sistemas\\SIGE2.0\\Dados\\SAC VENDA';

async function arquivos(dir) {
    const itens = await fs.readdir(dir, { withFileTypes: true });
    const resultado = [];
    for (const item of itens) {
        const arquivo = path.join(dir, item.name);
        if (item.isDirectory()) resultado.push(...await arquivos(arquivo));
        else if (item.isFile()) resultado.push(arquivo);
    }
    return resultado;
}

function mime(nome) {
    const ext = path.extname(nome).toLowerCase();
    return { '.pdf':'application/pdf', '.doc':'application/msword', '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xls':'application/vnd.ms-excel', '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png' }[ext] || 'application/octet-stream';
}

async function sync() {
    const client = await pool.connect();
    try {
        await client.query(`CREATE TABLE IF NOT EXISTS sac_anexos_sync (id BIGSERIAL PRIMARY KEY, sac_codigo INTEGER NOT NULL, anexo_codigo INTEGER, caminho_relativo TEXT NOT NULL UNIQUE, nome_arquivo TEXT NOT NULL, mime_type TEXT NOT NULL, tamanho_bytes BIGINT NOT NULL, modificado_em TIMESTAMPTZ NOT NULL, hash_sha256 CHAR(64) NOT NULL, conteudo BYTEA NOT NULL, sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
        await client.query('CREATE INDEX IF NOT EXISTS idx_sac_anexos_sync_sac ON sac_anexos_sync (sac_codigo, anexo_codigo)');
        await client.query("DELETE FROM sac_anexos_sync WHERE LOWER(nome_arquivo) = 'thumbs.db'");
        const lista = await arquivos(ROOT);
        let sincronizados = 0;
        for (const arquivo of lista) {
            if (path.basename(arquivo).toLowerCase() === 'thumbs.db') continue;
            const relativo = path.relative(ROOT, arquivo).replace(/\\/g, '/');
            const partes = relativo.split('/');
            const sac = Number(partes[0]), anexo = Number(partes[1]);
            if (!Number.isInteger(sac)) continue;
            const [conteudo, stat] = await Promise.all([fs.readFile(arquivo), fs.stat(arquivo)]);
            const hash = crypto.createHash('sha256').update(conteudo).digest('hex');
            const result = await client.query(`INSERT INTO sac_anexos_sync (sac_codigo,anexo_codigo,caminho_relativo,nome_arquivo,mime_type,tamanho_bytes,modificado_em,hash_sha256,conteudo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (caminho_relativo) DO UPDATE SET sac_codigo=EXCLUDED.sac_codigo,anexo_codigo=EXCLUDED.anexo_codigo,nome_arquivo=EXCLUDED.nome_arquivo,mime_type=EXCLUDED.mime_type,tamanho_bytes=EXCLUDED.tamanho_bytes,modificado_em=EXCLUDED.modificado_em,hash_sha256=EXCLUDED.hash_sha256,conteudo=EXCLUDED.conteudo,sincronizado_em=NOW() WHERE sac_anexos_sync.hash_sha256 IS DISTINCT FROM EXCLUDED.hash_sha256 RETURNING id`, [sac, Number.isInteger(anexo) ? anexo : null, relativo, path.basename(arquivo), mime(arquivo), stat.size, stat.mtime, hash, conteudo]);
            sincronizados += result.rowCount;
        }
        console.log(`Anexos SAC sincronizados: ${lista.length} encontrados, ${sincronizados} incluídos/atualizados.`);
    } finally { client.release(); await pool.end(); }
}

sync().catch(error => { console.error('Falha na sincronização de anexos SAC:', error); process.exitCode = 1; });
