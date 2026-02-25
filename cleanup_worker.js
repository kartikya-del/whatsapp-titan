const fs = require('fs');
let content = fs.readFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-final/engine/ExtractionWorker.js', 'utf8');

// Join strings: 'a' + 'b' -> 'ab'
content = content.replace(/'\s*\+\s*'/g, '');
content = content.replace(/"\s*\+\s*"/g, '');

// Bracket notation to dot: this['number'] -> this.number
content = content.replace(/(\bthis|[\w$]+)\[['"]([a-zA-Z_$][\w$]*)['"]\]/g, '$1.$2');

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-final/engine/ExtractionWorker.js', content);
console.log("Cleaned up ExtractionWorker.js");
