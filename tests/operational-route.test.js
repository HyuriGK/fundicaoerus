const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { getItemSectorMetrics } = require('../public/js/shared-utils');

const route = [
    { setor_codigo: 12, setor: 'MOLDAGEM MANUAL', produzido: 4, refugado: 0 },
    { setor_codigo: 116, setor: 'FECHAMENTO MANUAL', produzido: 2, refugado: 0 },
    { setor_codigo: 20, setor: 'FUSAO', produzido: 0, refugado: 0 }
];
const order = {
    OP_PCS: '5450', OP_QUANTIDADE: 10, QUANTIDADE_PPR: 10,
    ROTEIRO_OPERACIONAL_OBRIGATORIO: true,
    QTY_MOLDADA: 99, QTY_FECHAMENTO_MANUAL: 99, QTY_FUSAO: 99,
    ROTEIRO_PRODUCAO: 'MOLDAGEM PESADA,FECHAMENTO,USINAGEM'
};

test('operational quantities override conflicting legacy quantities', () => {
    const metrics = getItemSectorMetrics({ ...order, ROTEIRO_OPERACIONAL: route });
    assert.equal(metrics.rawMoldada, 4);
    assert.equal(metrics.rawFusao, 0);
    assert.equal(metrics.qFechamento, 2);
});

test('missing operational route cannot fall back to the legacy route', () => {
    for (const missing of [undefined, [], null]) {
        const metrics = getItemSectorMetrics({ ...order, ROTEIRO_OPERACIONAL: missing });
        for (const key of ['qFechamento', 'qAguardando', 'qMoldada', 'qFusao', 'qAcabamento', 'qTT', 'qUsinagem', 'qQualidade', 'qExpedicao']) {
            assert.equal(metrics[key], 0, key);
        }
        assert.equal(metrics.totalBalance, 10);
    }
});

test('a legacy closure flag cannot add closure to the actual route', () => {
    const metrics = getItemSectorMetrics({ ...order, TEM_FECHAMENTO_MANUAL: true, ROTEIRO_OPERACIONAL: route.filter(row => row.setor_codigo !== 116) });
    assert.equal(metrics.qFechamento, 0);
});

test('partial and completed closure use only operational pointings', () => {
    for (const [closed, expected] of [[0, 4], [2, 2], [4, 0]]) {
        const rows = route.map(row => row.setor_codigo === 116 ? { ...row, produzido: closed } : row);
        assert.equal(getItemSectorMetrics({ ...order, ROTEIRO_OPERACIONAL: rows }).qFechamento, expected);
    }
});

const html = fs.readFileSync(path.join(__dirname, '../public/pedidos.html'), 'utf8');
function modalContext(rows, failure) {
    const elements = new Map();
    const requests = [];
    const context = vm.createContext({
        window: {}, localStorage: { getItem: () => null }, console: { error() {} },
        document: { getElementById(id) {
            if (!elements.has(id)) elements.set(id, { style: {}, innerHTML: '', textContent: '', remove() {} });
            return elements.get(id);
        } },
        fetchPedidosJson: async url => { requests.push(url); if (failure) throw new Error('API indisponivel'); return rows; }
    });
    const start = html.indexOf('        let leadTimes =');
    const end = html.indexOf('        window.showSectorHistory =', start);
    vm.runInContext(html.slice(start, end), context);
    return { context, elements, requests };
}

test('modal renders only actual stages, including unpointed and unknown stages', async () => {
    const rows = [...route, { setor_codigo: 999, setor: 'ETAPA ESPECIAL', produzido: 1, refugado: 0 }];
    const { context, elements, requests } = modalContext(rows);
    await context.window.showOPDetails({ op: '5450', originalQty: 10, route: 'USINAGEM,EXPEDICAO,FATURAMENTO' });
    const rendered = elements.get('opDetailsContent').innerHTML;
    assert(rendered.includes('FECHAMENTO MANUAL'));
    assert(rendered.includes('ETAPA ESPECIAL'));
    assert(rendered.includes('>FUSÃO</span>'));
    assert(rendered.indexOf('>MOLDAGEM</span>') < rendered.indexOf('>FECHAMENTO MANUAL</span>'));
    for (const absent of ['USINAGEM', 'EXPEDIÇÃO', 'FATURAMENTO']) assert(!rendered.includes(absent));
    assert.equal(requests.length, 1);
    assert(requests[0].includes('/op-roteiro-operacional?'));
});

test('empty or failed operational API never loads a substitute route', async () => {
    for (const failure of [false, true]) {
        const { context, elements, requests } = modalContext([], failure);
        await context.window.showOPDetails({ op: '5450', originalQty: 10, route: 'MOLDAGEM,FECHAMENTO,FUSAO' });
        const content = elements.get('opDetailsContent');
        assert(!content.innerHTML.includes('op-detail-row'));
        assert(failure ? content.innerHTML.includes('Erro:') : content.textContent.includes('Roteiro operacional indisponível'));
        assert.equal(requests.length, 1);
    }
});
