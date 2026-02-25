const fs = require('fs');
const path = require('path');

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-fresh/engine/whatsappLogin.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Extract logic from the single-line file
const arrayMatch = content.match(/function _0x426e\(\)\{const _0x12198f=\[.*?\];_0x426e=function\(\)\{return _0x12198f;\};return _0x426e\(\);\}/);
const initMatch = content.match(/\(function\(_0x71104b,_0x4dfe03\)\{const _0x174712=_0x65c9,_0x1fc4dd=_0x71104b\(\);while\(!!\[\]\)\{try\{.*?\}catch\(_0x130139\)\{_0x1fc4dd\['push'\]\(_0x1fc4dd\['shift'\]\(\)\);\}\}\}\(_0x426e,0xf1240\)\);/);
const decoderMatch = content.match(/function _0x65c9\(_0x130482,_0x272b90\)\{_0x130482=_0x130482-0x188;const _0x2bfd1f=_0x426e\(\);.*?return _0x254b5b;\}/);

if (!decoderMatch || !arrayMatch || !initMatch) {
    if (!arrayMatch) console.error("Failed to find arrayMatch");
    if (!initMatch) console.error("Failed to find initMatch");
    if (!decoderMatch) console.error("Failed to find decoderMatch");
    process.exit(1);
}

const sandbox = `
    ${arrayMatch[0]}
    let _0x426e_val = _0x426e;
    ${initMatch[0]}
    ${decoderMatch[0]}
    module.exports = _0x65c9;
`;

const sandboxPath = path.join(__dirname, 'sandbox_whatsapp.js');
fs.writeFileSync(sandboxPath, sandbox);
const decoder = require(sandboxPath);

// 2. Replace calls
const pattern = /_0x(?:65c9|2783c0)\((0x[0-9a-f]+),\s*'([^']+)'\)/g;
let restoredContent = content;

const cache = {};
let match;
const matches = [];
while ((match = pattern.exec(content)) !== null) {
    matches.push({ full: match[0], hex: match[1], key: match[2] });
}

matches.sort((a, b) => b.full.length - a.full.length); // Longest first

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

// 3. Cleanup
restoredContent = restoredContent.replace(/const _0x2783c0=_0x65c9;/, "");
restoredContent = restoredContent.replace(/\(function\(_0x71104b,_0x4dfe03\)\{const _0x174712=_0x65c9,_0x1fc4dd=_0x71104b\(\);while\(!!\[\]\)\{try\{.*?\}catch\(_0x130139\)\{_0x1fc4dd\['push'\]\(_0x1fc4dd\['shift'\]\(\)\);\}\}\}\(_0x426e,0xf1240\)\);/, "");
restoredContent = restoredContent.replace(/function _0x65c9\(_0x130482,_0x272b90\)\{_0x130482=_0x130482-0x188;const _0x2bfd1f=_0x426e\(\);.*?return _0x254b5b;\}/, "");
restoredContent = restoredContent.replace(/function _0x426e\(\)\{const _0x12198f=\[.*?\];_0x426e=function\(\)\{return _0x12198f;\};return _0x426e\(\);\}/, "");

// Remove junk wrappers
restoredContent = restoredContent.replace(/const _0x1ed4e3=\(function\(\)\{.*?\}\(\),_0x1c3dca=_0x1ed4e3\(this,function\(\)\{.*?\}\);_0x1c3dca\(\);/, "");
restoredContent = restoredContent.replace(/function _0x254b5b\(_0x1adbb3\)\{.*?_0x254b5b\(\);/, "");

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/whatsappLogin_restored.js', restoredContent);
console.log("Created whatsappLogin_restored.js");
