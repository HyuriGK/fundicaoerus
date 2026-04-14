const fs = require('fs');
const files = [
    'public/faturamentos.html',
    'public/acabamento_externo.html',
    'public/acabamento_interno.html',
    'public/custos.html',
    'public/aderencia.html',
    'public/devolucoes.html',
    'public/reuniao.html',
    'public/apontamentos_produtivos.html'
];

files.forEach(path => {
    if (!fs.existsSync(path)) return;
    let content = fs.readFileSync(path, 'utf8');

    // 1. Rename "Ver Tabela" to "Registros"
    content = content.replace(/Ver Tabela/gi, 'Registros');

    // 2. Standardize KPI title
    // Look for kpi-card and add title if not present or replace if generic
    // Use a regex to identify kpi-card div start
    content = content.replace(/(class="kpi-card[^"]*")([^>]*)/g, (match, p1, p2) => {
        if (!p2.includes('title=')) {
            return `${p1} title="Clique esquerdo para ver os registros"${p2}`;
        }
        return match;
    });

    // 3. Add tooltip observation to Chart.js
    // We target common patterns like label: (ctx) => or plugins: { tooltip: { ... } }
    
    // Pattern A: label callback
    content = content.replace(
        /(label:\s*\(ctx\)\s*=>\s*`[^`]+`)(?!\s*,\s*afterBody)/g,
        "$1, afterBody: () => ['', '🖱 Clique esquerdo para ver os registros']"
    );

    // Pattern B: Empty tooltip plugin config
    content = content.replace(
        /tooltip:\s*\{(\s*)([^\}]*)\}/g,
        (match, p1, p2) => {
            if (p2.includes('afterBody')) return match;
            if (p2.trim() === '') {
                return `tooltip: {${p1}callbacks: { afterBody: () => ['', '🖱 Clique esquerdo para ver os registros'] }${p1}}`;
            }
            if (p2.includes('callbacks:')) {
                // Already has callbacks, but maybe not afterBody. 
                // Pattern A usually catches the label inside.
                return match;
            }
            // Has other tooltip options but no callbacks
            return `tooltip: {${p1}${p2}, callbacks: { afterBody: () => ['', '🖱 Clique esquerdo para ver os registros'] }${p1}}`;
        }
    );

    fs.writeFileSync(path, content);
    console.log(`${path} updated successfully`);
});
