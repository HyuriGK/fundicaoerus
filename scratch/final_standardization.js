const fs = require('fs');
const files = [
    'public/faturamentos.html',
    'public/carteira.html',
    'public/clientes.html',
    'public/acabamento_externo.html',
    'public/acabamento_interno.html',
    'public/custos.html',
    'public/aderencia.html',
    'public/devolucoes.html',
    'public/reuniao.html',
    'public/apontamentos_produtivos.html',
    'public/fichatecmoldagem.html'
];

files.forEach(path => {
    if (!fs.existsSync(path)) return;
    let content = fs.readFileSync(path, 'utf8');

    // 1. Rename "Ver Tabela" to "Registros" (Case insensitive)
    content = content.replace(/Ver Tabela/gi, 'Registros');

    // 2. Standardize KPI title
    // "clique esquerdo para ver os registros"
    content = content.replace(/(class="kpi-card[^"]*")([^>]*)/g, (match, p1, p2) => {
        if (!p2.includes('title=')) {
            return `${p1} title="Clique esquerdo para ver os registros"${p2}`;
        } else {
            // Replace existing title with the standardized one
            return `${p1} title="Clique esquerdo para ver os registros"${p2.replace(/title="[^"]*"/, '')}`;
        }
    });

    // 3. Add tooltip observation to Chart.js
    // Pattern: label: (ctx) => ...
    content = content.replace(
        /(label:\s*\(ctx\)\s*=>\s*`[^`]+`)(?!\s*,\s*afterBody)/g,
        "$1, afterBody: () => ['', '🖱 Clique esquerdo para ver os registros']"
    );

    // Pattern: boxPadding: 6 (Standard in some charts)
    content = content.replace(
        /boxPadding: 6\s+}/g,
        "boxPadding: 6, callbacks: { afterBody: () => ['', '🖱 Clique esquerdo para ver os registros'] } }"
    );

    fs.writeFileSync(path, content);
    console.log(`${path} updated and standardized`);
});
