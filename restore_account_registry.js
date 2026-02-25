const fs = require('fs');
const path = require('path');

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-fresh/engine/AccountRegistry.js';
let content = fs.readFileSync(filePath, 'utf8');

// Account Registry logic
const arrayMatch = content.match(/function _0x5915\(\)\{const _0x24ae77=\[.*?\];_0x5915=function\(\)\{return _0x24ae77;\};return _0x5915\(\);\}/);
const initMatch = content.match(/\(function\(_0x33f5b2,_0x151c77\)\{const _0x1a1ae9=_0x105b,.*?\}\(_0x5915,0x87487\)\);/);
const decoderMatch = content.match(/function _0x105b\(_0x456751,_0x3faf39\)\{_0x456751=_0x456751-0xcf;const _0x13286e=_0x5915\(\);.*?return _0x107658;\}/);

if (!decoderMatch || !arrayMatch || !initMatch) {
    if (!arrayMatch) console.error("Failed to find arrayMatch");
    if (!initMatch) console.error("Failed to find initMatch");
    if (!decoderMatch) console.error("Failed to find decoderMatch");
    process.exit(1);
}

const sandbox = `
    ${arrayMatch[0]}
    let _0x5915_val = _0x5915;
    ${initMatch[0]}
    ${decoderMatch[0]}
    module.exports = _0x105b;
`;

const sandboxPath = path.join(__dirname, 'sandbox_registry.js');
fs.writeFileSync(sandboxPath, sandbox);
const decoder = require(sandboxPath);

// All alias regex
const pattern = /_0x(?:105b|1a1ae9|2c441b|1b41dc|3fa6b0|3ce7cf|316e0f|1974fd|5aa23f|3632bd|_0xa59362|2dd33c|151d76|26844a|21aff5|440b48|1c9049|12c217|567a55|1804b1|2bd5a3|315789|44634a|4cf993|_0x545232|593de0|2a5508|2b6881|3878c4|59d368|_0x4b3cf0|105b)\((0x[0-9a-f]+),\s*'([^']+)'\)/g;

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
restoredContent = restoredContent.replace(/const _0x1c6d96\s*=\s*_0x105b;/, "");

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/AccountRegistry_restored.js', restoredContent);
console.log("Created AccountRegistry_restored.js");
