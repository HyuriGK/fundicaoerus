const fs = require('fs');
const path = 'c:/Users/brasi/Desktop/server/public/pedidos.html';
let content = fs.readFileSync(path, 'utf8');

// Use a more robust approach: find the block and replace the whole thing
const startMarker = '// Hierarchical Logic: Limited by Commercial Order';
const endMarker = 'let qAguardando  = Math.max(0, targetTotalQty - cMold);';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
    const newBlock = `// Hierarchical Logic: Industrial Reality
                    const totalInitialQty = Number(item.QUANTIDADE_PPR) || 0;
                    const currentBalance = Number(item.SALDO_LIBERADO_FATURAR_PPR) || 0;
                    const targetTotalQty = totalInitialQty; 
                    const invoicedQty = Math.max(0, totalInitialQty - currentBalance);

                    const cExp  = Number(item.QTY_EXPEDICAO) || 0;
                    const cQual = Math.max(cExp,  Number(item.QTY_QUALIDADE) || 0);
                    const cUsi  = Math.max(cQual, Number(item.QTY_USINAGEM) || 0);
                    const cTT   = Math.max(cUsi,  Number(item.QTY_TT) || 0);
                    const cAcab = Math.max(cTT,   Number(item.QTY_ACABAMENTO) || 0);
                    const cFus  = Math.max(cAcab, Number(item.QTY_FUSAO) || 0);
                    const cMold = Math.max(cFus,  Number(item.QTY_MOLDADA) || 0);

                    let qExpedicao   = Math.max(0, cExp - invoicedQty);
                    let qQualidade   = Math.max(0, cQual - cExp);
                    let qUsinagem    = Math.max(0, cUsi - cQual);
                    let qTT          = Math.max(0, cTT - cUsi);
                    let qAcabamento  = Math.max(0, cAcab - cTT);
                    let qFusao       = Math.max(0, cFus - cAcab);
                    let qMoldada     = Math.max(0, cMold - cFus);
                    let qAguardando  = Math.max(0, targetTotalQty - cMold);`;

    const oldBlock = content.substring(startIndex, endIndex + endMarker.length);
    content = content.replace(oldBlock, newBlock);
    
    fs.writeFileSync(path, content);
    console.log('Sync v2 completed');
} else {
    console.error('Markers not found');
    console.log('Start:', startIndex, 'End:', endIndex);
}
