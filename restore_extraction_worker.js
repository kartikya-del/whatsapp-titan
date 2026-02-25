const fs = require('fs');
const path = require('path');

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-fresh/engine/ExtractionWorker.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Extract logic using regex for the single-line 95KB file
const arrayMatch = content.match(/function _0x1bf5\(\)\{const _0xb0a370=\[.*?\];_0x1bf5=function\(\)\{return _0xb0a370;\};return _0x1bf5\(\);\}/);
const initMatch = content.match(/\(function\(_0x199349,_0x3c76fd\)\{const _0x279a2b=_0x2592,_0x7d0357=_0x199349\(\);while\(!!\[\]\)\{try\{.*?\}catch\(_0xc4f6e\)\{_0x7d0357\['push'\]\(_0x7d0357\['shift'\]\(\)\);\}\}\}\(_0x1bf5,0xc26a9\)\);/);
const decoderMatch = content.match(/function _0x2592\(_0x240084,_0x2a34d5\)\{_0x240084=_0x240084-0x1a8;const _0x246b7c=_0x1bf5\(\);.*?return _0x352073;\}/);

if (!decoderMatch || !arrayMatch || !initMatch) {
    if (!arrayMatch) console.error("Failed to find arrayMatch");
    if (!initMatch) console.error("Failed to find initMatch");
    if (!decoderMatch) console.error("Failed to find decoderMatch");
    process.exit(1);
}

const sandbox = `
    ${arrayMatch[0]}
    let _0x1bf5_val = _0x1bf5;
    ${initMatch[0]}
    ${decoderMatch[0]}
    module.exports = _0x2592;
`;

const sandboxPath = path.join(__dirname, 'sandbox_worker.js');
fs.writeFileSync(sandboxPath, sandbox);
const decoder = require(sandboxPath);

// 2. Replace all _0x2592... and _0x26b4d5...
// Need to find the local aliases
const pattern = /_0x(?:2592|26b4d5|279a2b|4d2f5b|3d8848|5352e5|edcc5d|48ca1|4f6ba4|803649|1f3df9|2083f3|4d5639|2a23fc|56619e|3ae99b|2a4e6c|b467bf|e36174|19da58|492200|23d444|12b350|bb613b|459937|51c1bc|2a23fc|19eb26|5cfbc1|581c7b|1352be|3441b9|34d77d|4267e6|4f4a99|19f5b6|43058a|75256|d80e60|17cd92|47d986|40bf28|41774f|32a738|3a2872|2befcf|1b430b|571490|2dd9e0|4990a8)\((0x[0-9a-f]+),\s*'([^']+)'\)/g;

let restoredContent = content;
const cache = {};
let match;
const matches = [];
while ((match = pattern.exec(content)) !== null) {
    matches.push({ full: match[0], hex: match[1], key: match[2] });
}

console.log(`Found ${matches.length} string calls. Restoring...`);

// Sort by length descending to avoid partial replacement issues
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
    // Use split/join for safety on this huge string
    restoredContent = restoredContent.split(m.full).join("'" + escapedResult + "'");
});

// 3. Cleanup logic headers
restoredContent = restoredContent.replace(/const _0x26b4d5=_0x2592;/, "");
restoredContent = restoredContent.replace(/\(function\(_0x199349,_0x3c76fd\)\{const _0x279a2b=_0x2592,_0x7d0357=_0x199349\(\);while\(!!\[\]\)\{try\{.*?\}catch\(_0xc4f6e\)\{_0x7d0357\['push'\]\(_0x7d0357\['shift'\]\(\)\);\}\}\}\(_0x1bf5,0xc26a9\)\);/, "");
restoredContent = restoredContent.replace(/function _0x2592\(_0x240084,_0x2a34d5\)\{_0x240084=_0x240084-0x1a8;const _0x246b7c=_0x1bf5\(\);.*?return _0x352073;\}/, "");
restoredContent = restoredContent.replace(/function _0x1bf5\(\)\{const _0xb0a370=\[.*?\];_0x1bf5=function\(\)\{return _0xb0a370;\};return _0x1bf5\(\);\}/, "");

// Beautify the output
fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/ExtractionWorker_restored.js', restoredContent);
console.log("Created ExtractionWorker_restored.js");
