const fs = require('fs');
const path = require('path');

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-fresh/engine/ExtractionManager.js';
let content = fs.readFileSync(filePath, 'utf8');

// Extraction Worker logic
const arrayMatch = content.match(/function _0x2097\(\)\{const _0x2e5219=\[.*?\];_0x2097=function\(\)\{return _0x2e5219;\};return _0x2097\(\);\}/);
const initMatch = content.match(/\(function\(_0xb1078b,_0xe7390c\)\{const _0x119dab=_0x532e,.*?\}\(_0x2097,0xd2936\)\);/);
const decoderMatch = content.match(/function _0x532e\(_0x461edd,_0x58452c\)\{_0x461edd=_0x461edd-0xae;const _0x2fa8ad=_0x2097\(\);.*?return _0x54df46;\}/);

if (!decoderMatch || !arrayMatch || !initMatch) {
    if (!arrayMatch) console.error("Failed to find arrayMatch");
    if (!initMatch) console.error("Failed to find initMatch");
    if (!decoderMatch) console.error("Failed to find decoderMatch");
    process.exit(1);
}

const sandbox = `
    ${arrayMatch[0]}
    let _0x2097_val = _0x2097;
    ${initMatch[0]}
    ${decoderMatch[0]}
    module.exports = _0x532e;
`;

const sandboxPath = path.join(__dirname, 'sandbox_manager.js');
fs.writeFileSync(sandboxPath, sandbox);
const decoder = require(sandboxPath);

// All alias regex
const pattern = /_0x(?:532e|119dab|2f4b37|20f19d|18d188|246d70|5a2396|3cfd9c|55557e|344fd8|265682|f654e6|580265|1304fd|58bf96|c5bb7f|51bb62|4e04cf|c0b9bd|17183e|21168b|67bc62|254d5c|528796|876b54|576e5c|24c736|6b62a8|3a67c7|15ab93|2967b7|2bb81e|5abc94|201834|1d6ad4|356bd1|222f99|55ece8|eed452|1fd526|2ffa00|40c55e|24d1f9|46d70b|3ac733|5eb7a8|52d1c1|3c85cb|2f43a1|220b1f|53c691|227938|492003|2aef6c)\((0x[0-9a-f]+),\s*'([^']+)'\)/g;

let restoredContent = content;
const cache = {};
let match;
const matches = [];
while ((match = pattern.exec(content)) !== null) {
    matches.push({ full: match[0], hex: match[1], key: match[2] });
}

console.log(`Found ${matches.length} string calls. Restoring...`);
matches.sort((a, b) => b.full.length - a.full.length);

matches.forEach(m => {
    const id = m.hex + m.key;
    if (!cache[id]) {
        try {
            cache[id] = decoder(parseInt(m.hex, 16), m.key);
        } catch (e) {
            return;
        }
    }
    const result = cache[id];
    const escapedResult = result.replace(/'/g, "\\'");
    restoredContent = restoredContent.split(m.full).join("'" + escapedResult + "'");
});

// Basic cleanup
restoredContent = restoredContent.replace(/const _0x55557e\s*=\s*_0x532e;/, "");

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/ExtractionManager_restored.js', restoredContent);
console.log("Created ExtractionManager_restored.js");
