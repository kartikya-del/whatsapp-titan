const fs = require('fs');

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/LicenseManager_fixed.js';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove the vestigial constructor lines
content = content.replace(/const d = decoder,\s*/g, "");
content = content.replace(/const d\d+ = decoder,\s*/g, "");

// 2. Fix the method definitions (remove the leading dot and space)
content = content.replace(/ \.([a-zA-Z0-9_$]+)\(/g, " $1(");

// 3. Flatten the 'constants' and 'helpers' objects if they are just simple proxy property holders
// This is harder to automate perfectly, but let's fix the obvious ones.
// e.g., constants.SVHht = 'titan-license.json'
// then used as c.SVHht

// Actually, it's better to just leave them as they are logically sound now, 
// OR I can do a very aggressive replacement of these specific tokens.
// Let's do a few key ones that are everywhere.

const finalRenames = {
    'SVHht': "'titan-license.json'",
    'wKeDo': "'No license found.'",
    'oRkXg': "'[LICENSE] checkLimit error:'",
    'qUAXj': "'00:00:00:00:00:00'",
    'tOYao': "'sha256'",
    'qSCmJ': "'sha256'",
    'MYBLm': "':titan-cache-v3'",
    'qbAZf': "'sha256'",
    'JTpWk': "'hex'",
    'pxLLr': "'hex'",
    'VAAIu': "'validate_license'",
    'EmoRJ': "'validate_license'",
    'JfPjR': "'License revoked by server.'",
    'imqFQ': "'utf8'",
    'EsPas': "'Cached license unreadable.'",
    'knBdZ': "'[LICENSE] OFFLINE GRACE MODE — server unreachable, cache valid.'",
    'YDHbI': "'Offline grace period (48h) exceeded. Reconnect to internet.'",
    'zmovS': "'TRIAL'",
    'zuWXa': "'Could not reach license server: '",
    'PEDrH': "'short'",
    'awguj': "'get_usage_today'",
    'ajLUq': "'[LICENSE] getUsage failed:'",
    'nQcoK': "'increment_usage'",
    'pVpHc': "'No valid license. Please activate Titan to continue.'",
    'tYhSJ': "'message'",
    'qLDmN': "'extraction'",
    'pHwhl': "'extract'"
};

for (const [key, val] of Object.entries(finalRenames)) {
    // Replace c.key, helpers.key, vars.key, etc.
    content = content.replace(new RegExp('\\b(c|helpers|vars|opts|o|h|h\\d+|v|constants)\\.' + key + '\\b', 'g'), val);
}

// 4. Clean up the now-empty helper definitions
content = content.replace(/const (constants|helpers|vars|opts|o|h|h\d+|v) = \{\};\s*/g, "");
content = content.replace(/(constants|helpers|vars|opts|o|h|h\d+|v)\.[a-zA-Z0-9_$]+ = [^,;]+[,;]\s*/g, "");

// 5. Final pass for Boolean literals
content = content.replace(/!\[\]/g, "false");
content = content.replace(/!!\[\]/g, "true");

// 6. Remove the 'decoder' argument or local var if any left
content = content.replace(/const d = decoder;/g, "");

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/LicenseManager_final_v2.js', content);
console.log("Created LicenseManager_final_v2.js");
