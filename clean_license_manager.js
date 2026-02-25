const fs = require('fs');

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/LicenseManager_restored.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove the large junk blocks at the top
// Remove string array function _0x55d1
content = content.replace(/function _0x55d1\(\)\{[\s\S]*?return _0x55d1\(\);\s*\}/, "");
// Remove the self-executing reorder function
content = content.replace(/\(function\(_0x1ddfe8,_0x14fe21\)[\s\S]*?\}\(_0x55d1,0xdb3ab\)\);/, "");
// Remove the _0x34c7e1 and _0x2f543d guard functions
content = content.replace(/const _0x34c7e1[\s\S]*?_0x2f543d\(\);/, "");
// Remove the decoder _0x3c3e itself
content = content.replace(/function _0x3c3e\(_0x3c2329,_0x4444db\)[\s\S]*?return _0x396533;\s*\}/, "");
// Remove the intervals/guards at the beginning
content = content.replace(/const _0x16a0bd[\s\S]*?_0x396533,0x7d0\);\}\(\)\);/, "");

// 2. Remove internal function proxies like "const _0xa28fe9 = _0x1fa5d1;"
content = content.replace(/const _0x[a-f0-9]+ = _0x1fa5d1;/g, "");
content = content.replace(/const _0x[a-f0-9]+ = _0x[a-f0-9]+;/g, ""); // Catch double proxies

// 3. Remove local object proxies like "const _0x5b4785 = {}; _0x5b4785['key'] = 'value';" (Optional but helpful)
// This is harder with regex, let's stick to the basics.

// 4. Final beautify
const beautify = require("js-beautify").js;
content = beautify(content, { indent_size: 2 });

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/LicenseManager_clean.js', content);
console.log("Created LicenseManager_clean.js");
