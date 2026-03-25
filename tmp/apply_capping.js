const fs = require('fs');
const filePath = 'c:\\Users\\brasi\\Desktop\\server\\public\\pedidos.html';
const content = fs.readFileSync(filePath, 'utf8');

// Target capping logic for industrial stages
const stages = ['cQual', 'cUsi', 'cTT', 'cAcab', 'cFus', 'cMold'];

let newContent = content;

// Replace in calculateKPIs (indent 16)
stages.forEach(s => {
    // Regex to match the original pattern with any indentation
    const regex = new RegExp(`const ${s}\\s+=\\s+Math\\.max\\(`, 'g');
    newContent = newContent.replace(regex, `const ${s} = Math.min(targetTotalQty, Math.max(`);
    
    // Also handle the second argument and close parenthesis
    // For calculateKPIs: const cQual = Math.max(cExp,  Number(item.QTY_QUALIDADE) || 0);
    // Becomes: const cQual = Math.min(targetTotalQty, Math.max(cExp,  Number(item.QTY_QUALIDADE) || 0));
    
    // Actually, simpler regex to just add the Math.min(targetTotalQty, ...) wrapper
    // We need to find the whole line and wrap it.
});

// Let's refine the script to be more precise based on what we saw in view_file

// calculateKPIs lines from Step 788:
// 2949:                 const cQual = Math.max(cExp,  Number(item.QTY_QUALIDADE) || 0);
// 2950:                 const cUsi  = Math.max(cQual, Number(item.QTY_USINAGEM) || 0);
// ...

const lines = newContent.split('\n');

for (let i = 2948; i < 2954; i++) { // Lines after cExp already changed
    if (lines[i].includes('Math.max(') && !lines[i].includes('Math.min(')) {
        lines[i] = lines[i].replace('= Math.max(', '= Math.min(targetTotalQty, Math.max(');
        lines[i] = lines[i].trimEnd() + ')';
    }
}

// applyColumnFilters lines from Step 758:
// 3476:                     const cExp  = Number(item.QTY_EXPEDICAO) || 0;
// 3477:                     const cQual = Math.max(cExp,  Number(item.QTY_QUALIDADE) || 0);
// ...
for (let i = 3475; i < 3482; i++) { // Lines 3476-3482 (0-indexed 3475-3481)
    if (lines[i].includes('= Number(') && !lines[i].includes('Math.min(')) {
         lines[i] = lines[i].replace('= Number(', '= Math.min(targetTotalQty, Number(');
         lines[i] = lines[i].trimEnd() + ')';
    } else if (lines[i].includes('Math.max(') && !lines[i].includes('Math.min(')) {
        lines[i] = lines[i].replace('= Math.max(', '= Math.min(targetTotalQty, Math.max(');
        lines[i] = lines[i].trimEnd() + ')';
    }
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Successfully updated pedidos.html with capping logic.');
