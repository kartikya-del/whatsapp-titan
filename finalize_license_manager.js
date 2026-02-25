const fs = require('fs');

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/LicenseManager_clean.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace hex escapes \xNN
content = content.replace(/\\x([0-9a-fA-F]{2})/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
});

// 2. Clear remaining junk function at the bottom
content = content.replace(/function _0x396533\(_0x534cfa\) \{[\s\S]*?\}\s*$/, "");

// 3. Remove the proxy assignment at the top
content = content.replace(/const _0x1fa5d1 = _0x3c3e;\s*/, "");

// 4. Remove all object proxies like _0x5b4785[_0xa28fe9(0x363, 'lZ@*')] = ...
// Since we already replaced the strings, it looks like:
// _0x5b4785['configPath'] = 'license.json';
// Let's try to simplify these patterns if they are simple enough.
// Pattern: const _0x5b4785 = {}; _0x5b4785['...'] = '...'; ... const _0x1fc57f = _0x5b4785;
// This is too complex for regex.

// Let's just fix the Supabase stuff to be single strings instead of 'a' + 'b'
content = content.replace(/' \+ '/g, "");

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/LicenseManager_final.js', content);
console.log("Created LicenseManager_final.js");
