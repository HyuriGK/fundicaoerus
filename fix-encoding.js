const fs = require('fs');
const f = 'public/index.html';
let c = fs.readFileSync(f, 'utf8');

// Double-encoded mojibake: UTF-8 bytes interpreted as Latin-1, then re-encoded as UTF-8
// Pattern: Ã + char => original UTF-8 char
const replacements = {
  'Ã¡': 'á', 'Ã¢': 'â', 'Ã£': 'ã', 'Ã¤': 'ä', 'Ã¥': 'å',
  'Ã¦': 'æ', 'Ã§': 'ç', 'Ã¨': 'è', 'Ã©': 'é', 'Ãª': 'ê',
  'Ã«': 'ë', 'Ã¬': 'ì', 'Ã­': 'í', 'Ã®': 'î', 'Ã¯': 'ï',
  'Ã°': 'ð', 'Ã±': 'ñ', 'Ã²': 'ò', 'Ã³': 'ó', 'Ã´': 'ô',
  'Ãµ': 'õ', 'Ã¶': 'ö', 'Ã¸': 'ø', 'Ã¹': 'ù', 'Ãº': 'ú',
  'Ã»': 'û', 'Ã¼': 'ü', 'Ã½': 'ý', 'Ã¿': 'ÿ',
  'Ã€': 'À', 'Ã‚': 'Â', 'Ã„': 'Ä', 'Ã…': 'Å', 'Ã†': 'Æ',
  'Ãˆ': 'È', 'Ã‰': 'É', 'ÃŠ': 'Ê', 'Ã‹': 'Ë', 'ÃŒ': 'Ì',
  'ÃŽ': 'Î', 'Ã': 'Ñ', 'Ã': 'Ò', 'Ã"': 'Ó', 'Ã•': 'Õ',
  'Ã–': 'Ö', 'Ã˜': 'Ø', 'Ã™': 'Ù', 'Ãš': 'Ú', 'Ã›': 'Û',
  'Ãœ': 'Ü', 'Ã': 'Ý',
};

for (const [bad, good] of Object.entries(replacements)) {
  while (c.includes(bad)) {
    c = c.replace(bad, good);
  }
}

fs.writeFileSync(f, c, 'utf8');
console.log('Fixed encoding in', f);

// Verify
const verify = fs.readFileSync(f, 'utf8');
const remaining = verify.match(/Ã[a-z]/g);
if (remaining) {
  console.log('WARNING: remaining mojibake patterns:', [...new Set(remaining)].join(', '));
} else {
  console.log('No mojibake patterns remaining');
}
