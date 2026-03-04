const fs = require('fs');
const content = fs.readFileSync('ficha_cols.txt', 'utf16le');
const cols = content.split(',').map(c => c.trim());
const search = ['CLI_COD', 'RELACAO', 'MOLDE', 'METAL'];
const matches = cols.filter(c => search.some(s => c.toUpperCase().includes(s)));
console.log('Matches:', matches.join(', '));
