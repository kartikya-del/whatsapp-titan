const fs = require('fs');
const path = require('path');

// Load the decoder from our sandbox
const sandboxPath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/sandbox_whatsapp.js';
const decoder = require(sandboxPath);

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/whatsappLogin_final.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Final String Resolve
const patterns = [
    /decoderAlias\((0x[0-9a-f]+),\s*'([^']+)'\)/g,
    /pageDecoder\((0x[0-9a-f]+),\s*'([^']+)'\)/g,
    /qrDecoder\((0x[0-9a-f]+),\s*'([^']+)'\)/g,
    /_0x2783c0\((0x[0-9a-f]+),\s*'([^']+)'\)/g,
    /d\((0x[0-9a-f]+),\s*'([^']+)'\)/g,
    /qd\((0x[0-9a-f]+),\s*'([^']+)'\)/g
];

let finalContent = content;

patterns.forEach(pattern => {
    finalContent = finalContent.replace(pattern, (match, hex, key) => {
        try {
            const result = decoder(parseInt(hex, 16), key);
            return "'" + result + "'";
        } catch (e) {
            return match;
        }
    });
});

// 2. Fix property access: object['prop'] -> object.prop
finalContent = finalContent.replace(/\['([a-zA-Z_$][a-zA-Z0-9_$]*)'\]/g, ".$1");

// 3. Remove local decoder aliases
finalContent = finalContent.replace(/const decoderAlias = _0x2783c0,\s*/, "");
finalContent = finalContent.replace(/const pageDecoder = _0x2783c0,\s*/, "");
finalContent = finalContent.replace(/const qrDecoder = _0x2783c0,\s*/, "");
finalContent = finalContent.replace(/const d = pageDecoder,/, "");
finalContent = finalContent.replace(/const qd = qrDecoder,/, "");

// 4. Flatten the 'helpers' object manually for the most common ones
const helperMap = {
    'callFunc': '((f, a) => f(a))', // or just remove them if simple enough
    'invoke': '((f, a) => f(a))',
    'exec': '((f, a) => f(a))',
    'run': '((f, a) => f(a))'
};

// Actually it's better to just inline the calls
finalContent = finalContent.replace(/helpers\.callFunc\(([^,]+),\s*([^)]+)\)/g, "$1($2)");
finalContent = finalContent.replace(/helpers\.invoke\(([^,]+),\s*([^)]+)\)/g, "$1($2)");
finalContent = finalContent.replace(/helpers\.exec\(([^,]+),\s*([^)]+)\)/g, "$1($2)");
finalContent = finalContent.replace(/helpers\.run\(([^,]+),\s*([^)]+)\)/g, "$1($2)");

// 5. Cleanup the integrity check block entirely if it's there
finalContent = finalContent.replace(/\(function\(\) \{[\s\S]*?integrityCheck, 0x7d0\);\s*\}\(\)\);/, "");

// 6. Fix sessionManager usage
finalContent = finalContent.replace(/sessionManager\.launch\s*'([^']+)'\s*r/g, "sessionManager.launchBrowser"); // Handle 'launch' + 'Browse' + 'r'
// Wait, the previous replacement might have left it weird.
// It was: sessionManager['launch' + decoderAlias(0x201, '5KRU') + 'r'](number);
// Decoder result for 0x201, '5KRU' is likely 'Browse'
// Let's just fix it specifically
finalContent = finalContent.replace(/sessionManager.launch'Browse'r/g, "sessionManager.launchBrowser");

// Clean up any remaining _0x vars
// Let's do one last check of the file content before final write

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/whatsappLogin_ultimate.js', finalContent);
console.log("Created whatsappLogin_ultimate.js");
