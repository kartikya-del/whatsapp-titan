const fs = require('fs');
const content = fs.readFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-final/engine/ExtractionWorker.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('_0x3a2872')) {
        console.log(`Line ${i + 1}: ${line.trim()}`);
    }
});
