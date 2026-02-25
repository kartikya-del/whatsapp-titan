const fs = require('fs');
const path = require('path');

// Extract the core obfuscation components from LicenseManager.js
const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-fresh/engine/LicenseManager.js';
let content = fs.readFileSync(filePath, 'utf8');

// We need to extract the string array and the decoder function.
// Since we can't easily execute the script safely without a full VM,
// we will use a trick: create a small sandbox script that exports the decoder.

const decoderScript = `
${content.split('\n').slice(0, 100).join('\n')}
// We need the full decoder _0x3c3e and its dependencies.
// It's usually near the top.
module.exports = _0x3c3e;
`;

// This is risky because the file is 800 lines. Let's find the end of the decoder.
// Searching for the end of the decoder function _0x3c3e.
const decoderMatch = content.match(/function _0x3c3e[\s\S]*?return _0x396533;?\s*\}/);
const arrayMatch = content.match(/function _0x55d1\(\)\{[\s\S]*?return _0x55d1\(\);\s*\}/);
const initMatch = content.match(/\(function\(_0x1ddfe8,_0x14fe21\)[\s\S]*?\}\(_0x55d1,0xdb3ab\)\);/);

if (decoderMatch && arrayMatch && initMatch) {
    const sandbox = `
    const os = { hostname: () => "restored" }; // mock os
    ${arrayMatch[0]}
    ${initMatch[0]}
    ${decoderMatch[0]}
    module.exports = _0x3c3e;
    `;

    const sandboxPath = path.join(__dirname, 'sandbox.js');
    fs.writeFileSync(sandboxPath, sandbox);
    const decoder = require(sandboxPath);

    // Now replace all _0x1fa5d1(0x...) calls
    const pattern = /_0x1fa5d1\((0x[0-9a-f]+),\s*'([^']+)'\)/g;
    let replaced = content.replace(pattern, (match, hex, key) => {
        try {
            return "'" + decoder(parseInt(hex), key).replace(/'/g, "\\'") + "'";
        } catch (e) {
            return match;
        }
    });

    // Also replace direct _0x3c3e calls if any
    const pattern2 = /_0x3c3e\((0x[0-9a-f]+),\s*'([^']+)'\)/g;
    replaced = replaced.replace(pattern2, (match, hex, key) => {
        try {
            return "'" + decoder(parseInt(hex), key).replace(/'/g, "\\'") + "'";
        } catch (e) {
            return match;
        }
    });

    fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/LicenseManager_restored.js', replaced);
    console.log("Restored strings in LicenseManager_restored.js");
} else {
    console.log("Failed to find decoder components");
    // Debug: print what we found
    console.log("Decoder Found:", !!decoderMatch);
    console.log("Array Found:", !!arrayMatch);
    console.log("Init Found:", !!initMatch);
}
