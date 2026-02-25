const fs = require('fs');
const content = fs.readFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/renderer/app.js', 'utf8');
const apicalls = new Set();
const regex = /api\.([a-zA-Z0-9_]+)/g;
let match;
while ((match = regex.exec(content)) !== null) {
    apicalls.add(match[1]);
}
console.log(Array.from(apicalls).sort().join('\n'));
