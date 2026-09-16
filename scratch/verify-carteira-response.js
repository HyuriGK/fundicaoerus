const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const report = console.log.bind(console);
console.log = () => {};
const pool = require('../lib/db');

async function run(source) {
    const sandbox = {
        module: { exports: {} }, console,
        require: name => name === '../lib/db' ? {
            query: (sql, params) => {
                if (/^\s*CREATE TABLE IF NOT EXISTS pedidos_(modelo_status|conferencia)/.test(sql)) return { rows: [] };
                assert.match(sql, /^\s*SELECT\b/i, 'Only read-only queries allowed');
                return pool.query(sql, params);
            }
        } : require(name)
    };
    vm.runInNewContext(source, sandbox);
    const handler = sandbox.module.exports.stack.find(layer => layer.route?.path === '/').route.stack[0].handle;
    let result;
    await handler({ query: { carteiraOnly: 'true' }, get: () => '', user: {} }, {
        json: data => { result = data; },
        status: code => { throw new Error(`HTTP ${code}`); }
    });
    assert.ok(Array.isArray(result));
    return result;
}

(async () => {
    const before = await run(execFileSync('git', ['show', 'HEAD:src/pedidos-sync.js'], { encoding: 'utf8' }));
    const after = await run(fs.readFileSync('src/pedidos-sync.js', 'utf8'));
    const target = rows => rows.find(row => row.sync_key === '10-2026-842-6');
    assert.equal(target(before), undefined, 'Reproduce missing item in original API response');
    const item = target(after);
    assert.ok(item, 'Corrected API must return the missing item');
    assert.equal(String(item.OP_PCS), '5862');
    assert.equal(Number(item.SALDO_LIBERADO_FATURAR_PPR), 1);
    assert.ok(item.ROTEIRO_OPERACIONAL.length > 0);
    assert.ok(after.some(row => row.sync_key === '10-2026-842-7'));
    report(JSON.stringify({ before: 'missing', after: { pedido: item.CODIGO_PPR, produto: item.PRODUTO_PPR, op: item.OP_PCS, saldo: item.SALDO_LIBERADO_FATURAR_PPR, routeRows: item.ROTEIRO_OPERACIONAL.length }, assertions: 'passed' }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
