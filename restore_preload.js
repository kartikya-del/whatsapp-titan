const fs = require('fs');
const path = require('path');

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-fresh/electron/preload.js';
let content = fs.readFileSync(filePath, 'utf8');

// Extract the initialization logic
const arrayMatch = content.match(/function _0xa14a\(\)\{const _0xe05e4d=\[.*?\];_0xa14a=function\(\)\{return _0xe05e4d;\};return _0xa14a\(\);\}/);
const initMatch = content.match(/\(function\(_0x1182ed,_0x29b6fc\)\{const _0x1d3d04=_0x5c28,.*?\}\(_0xa14a,0xc57d9\)\);/);
const decoderMatch = content.match(/function _0x5c28\(_0x1a6532,_0x35a24f\)\{_0x1a6532=_0x1a6532-0x12a;const _0x5ce9fb=_0xa14a\(\);.*?return _0x1e125c;\}/);

if (!decoderMatch || !arrayMatch || !initMatch) {
    if (!arrayMatch) console.error("Failed to find arrayMatch");
    if (!initMatch) console.error("Failed to find initMatch");
    if (!decoderMatch) console.error("Failed to find decoderMatch");
    process.exit(1);
}

const sandbox = `
    ${arrayMatch[0]}
    let _0xa14a_val = _0xa14a;
    ${initMatch[0]}
    ${decoderMatch[0]}
    module.exports = _0x5c28;
`;

const sandboxPath = path.join(__dirname, 'sandbox_preload.js');
fs.writeFileSync(sandboxPath, sandbox);
const decoder = require(sandboxPath);

// Replace all _0x142215... and _0x5c28... calls
const pattern = /_0x(?:142215|5c28|1d3d04|12f591|4b7d9b|3fdb06|18df7f|4453d7|46132c|30a5db|4bd872|4bd872|1a215e|17d186|2d9c13|461211|156688|72404b|50c852|3d28fc|436f6f|a71ac9|617fae|3ab34b|2bd588|c1db15|4705ac|2a675f|27d2c4|5bc7d9|540b88|134a41|1b3ee3|24d1f9|169b35|46d70b|4cd916|3ac733|20a23c|3393ec|4d7c79|43ce7f|5eb7a8|523881|4dc8ca|52d1c1|4da141|30b0f4|629a4e|3c60bd|e93837|3ffb4d|5be268|5d635f|5edd93|116c7e|536b45|55d0cc|50e8e3|5eea1c|3f096c|50e6c3|54d397|338c45|414aad|28e63f|26bfa1|4bcbc7|d14252|39b888|2bf41b|15ec2e|339a84|18f943|2754b0|123cc7|293201|3edd0b)\((0x[0-9a-f]+),\s*'([^']+)'\)/g;

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

// Cleanup headers
restoredContent = restoredContent.replace(/const _0x142215=_0x5c28;/, "");
restoredContent = restoredContent.replace(/\(function\(_0x1182ed,_0x29b6fc\)\{.*\}\(_0xa14a,0xc57d9\)\);/, "");
restoredContent = restoredContent.replace(/function _0xa14a\(\)\{.*\}\s*/, "");
restoredContent = restoredContent.replace(/function _0x5c28\(_0x1a6532,_0x35a24f\)\{.*return _0x1e125c;\}/, "");

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/electron/preload_restored.js', restoredContent);
console.log("Created preload_restored.js");
