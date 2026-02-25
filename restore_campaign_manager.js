const fs = require('fs');
const path = require('path');

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-fresh/engine/CampaignManager.js';
let content = fs.readFileSync(filePath, 'utf8');

// Extraction Worker logic
const arrayMatch = content.match(/function _0x3478\(\)\{const _0x561b2e=\[.*?\];_0x3478=function\(\)\{return _0x561b2e;\};return _0x3478\(\);\}/);
const initMatch = content.match(/\(function\(_0x4b4c2c,_0x1c06a5\)\{const _0x9359e8=_0x3470,.*?\}\(_0x3478,0x24a1a\)\);/);
const decoderMatch = content.match(/function _0x3470\(_0x875ff2,_0x20b606\)\{_0x875ff2=_0x875ff2-0x100;const _0xf0b9f4=_0x3478\(\);.*?return _0x40c84c;\}/);

if (!decoderMatch || !arrayMatch || !initMatch) {
    if (!arrayMatch) console.error("Failed to find arrayMatch");
    if (!initMatch) console.error("Failed to find initMatch");
    if (!decoderMatch) console.error("Failed to find decoderMatch");
    process.exit(1);
}

const sandbox = `
    ${arrayMatch[0]}
    let _0x3478_val = _0x3478;
    ${initMatch[0]}
    ${decoderMatch[0]}
    module.exports = _0x3470;
`;

const sandboxPath = path.join(__dirname, 'sandbox_campaign.js');
fs.writeFileSync(sandboxPath, sandbox);
const decoder = require(sandboxPath);

// All alias regex
const pattern = /_0x(?:3470|9359e8|3fa6b0|3ce7cf|53bb90|41e8ca|3caf1c|1d47f0|5d2cd1|3c450a|3cbe65|106c6e|4f90c1|16f689|3a257d|4ac029|47ea4d|28cbfc|_0x404956)\((0x[0-9a-f]+),\s*'([^']+)'\)/g;

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
restoredContent = restoredContent.replace(/const _0x404956\s*=\s*_0x3470;/, "");

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/CampaignManager_restored.js', restoredContent);
console.log("Created CampaignManager_restored.js");
