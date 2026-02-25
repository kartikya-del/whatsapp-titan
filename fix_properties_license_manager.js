const fs = require('fs');
const path = require('path');

// Load the decoder from our sandbox
const sandboxPath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/sandbox.js';
const decoder = require(sandboxPath);

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/LicenseManager_ultimate.js';
let content = fs.readFileSync(filePath, 'utf8');

// Pattern: d(0x363, 'lZ@*')
// We need to support d, d2, d3... up to d19 and _0x2c3836
const patterns = [
    /d\d*\((0x[0-9a-f]+),\s*'([^']+)'\)/g,
    /_0x2c3836\((0x[0-9a-f]+),\s*'([^']+)'\)/g
];

let finalContent = content;

patterns.forEach(pattern => {
    finalContent = finalContent.replace(pattern, (match, hex, key) => {
        try {
            const result = decoder(parseInt(hex, 16), key);
            return "'" + result + "'";
        } catch (e) {
            return match; // Fallback if error
        }
    });
});

// Post-replacement cleanups:
// 1. Join strings: 'a' + 'b' -> 'ab'
finalContent = finalContent.replace(/' \+ '/g, "");

// 2. Fix property access: object['prop'] -> object.prop (if prop is a valid identifier)
finalContent = finalContent.replace(/\['([a-zA-Z_$][a-zA-Z0-9_$]*)'\]/g, ".$1");

// 3. Remove the local aliases for decoder
finalContent = finalContent.replace(/const d\d* = decoder;\s*/g, "");
finalContent = finalContent.replace(/const _0x2c3836 = decoder;\s*/g, "");

// 4. Remove 'decoder' from constructor if it exists as an unused variable
// (Manually checked: it was const d = decoder)

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/LicenseManager_fixed.js', finalContent);
console.log("Created LicenseManager_fixed.js");
