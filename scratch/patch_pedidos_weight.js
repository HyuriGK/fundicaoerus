const fs = require('fs');
const path = 'public/pedidos.html';
let content = fs.readFileSync(path, 'utf8');

// Patch Monthly and Daily weight calculation
const oldRegex = /wUn = qOriginal > 0 \? \(parseFloat\(item.PESO_LIQUIDO_NPR\) \|\| 0\) \/ qOriginal : 0;/g;
const newContent = `const pLiq = parseFloat(item.PESO_LIQUIDO_NPR) || parseFloat(item.PESO_PRODUTO) || 0;
                            wUn = qOriginal > 0 ? pLiq / qOriginal : 0;`;

if (content.match(oldRegex)) {
    console.log('Encontrada a linha de cálculo de peso. Aplicando patch...');
    content = content.replace(oldRegex, newContent);
    fs.writeFileSync(path, content);
    console.log('Patch aplicado com sucesso em pedidos.html.');
} else {
    console.error('ERRO: Não foi possível localizar a linha de cálculo de peso original.');
    // List surrounding lines for manual check
    const lines = content.split('\n');
    const idx = lines.findIndex(l => l.includes('PESO_LIQUIDO_NPR'));
    if (idx !== -1) {
        console.log('Linha similar encontrada em:', idx + 1);
        console.log(lines[idx]);
    }
}
