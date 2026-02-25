const fs = require('fs');

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/whatsappLogin_restored.js';
let content = fs.readFileSync(filePath, 'utf8');

const renameMap = {
    // Top level wrappers
    '_0x1ed4e3': 'createWrapper',
    '_0x1c3dca': 'dummyInit',
    '_0x217836': 'antiDebugWrapper',
    '_0x254b5b': 'integrityCheck',
    '_0x7d1d3f': 'integrityRecursive',

    // Function params and local vars
    '_0x2be89e': 'sessionManager',
    '_0x1c54a8': 'number',
    '_0x51b904': 'onQr',
    '_0x226dd5': 'onLoggedIn',
    '_0x513a23': 'onError',

    '_0x48fca2': 'decoderAlias',
    '_0x434215': 'helpers',
    '_0x3b4357': 'qrInterval',
    '_0x54277a': 'loginInterval',
    '_0x28c574': 'browser',
    '_0x744530': 'page',
    '_0xf1d872': 'qrEmitted',

    // Helper property names
    'NcRqc': 'callFunc',
    'DijlB': 'andLogic',
    'vFEts': 'funcProxy',
    'seuGJ': 'isEqual',
    'XjeQa': 'invoke',
    'XKRPH': 'exec',
    'aGYNd': 'run',
    'XrMxi': 'applyArgs',

    // isLoggedIn function
    'isLoggedIn': 'checkLoginStatus',
    '_0x1f32c8': 'targetPage',
    '_0x1186f9': 'pageDecoder',
    '_0x4d54a6': 'selectors',
    '_0x26f144': 's',
    '_0x286c97': 'd',
    '_0x27ad36': 'isLanding',
    '_0x3b203f': 'mainElement',
    '_0x314420': 'sidePanel',

    // getQrCode
    'getQrCode': 'extractQrCode',
    '_0xd65387': 'qrPage',
    '_0x1dacf5': 'qrDecoder',
    '_0x14b689': 'qrSelectors',
    '_0x3b1645': 'qs',
    '_0x48ec2a': 'qd',
    '_0x579dfd': 'canvasElement'
};

let finalContent = content;

// Aggressive cleanup for the integrity check and junk wrappers
finalContent = finalContent.replace(/const _0x1ed4e3 = \(function\(\) \{[\s\S]*?_0x1c3dca\(\);\s*/, "");
finalContent = finalContent.replace(/const _0x217836 = \(function\(\) \{[\s\S]*?\}\(\)\);\s*/, "");
finalContent = finalContent.replace(/\(function\(\) \{[\s\S]*?\}\(\)\);\s*/, "");
finalContent = finalContent.replace(/function _0x254b5b\(_0x1adbb3\) \{[\s\S]*?\}\s*$/, "");

// Rename identified variables
for (const [obf, clean] of Object.entries(renameMap)) {
    const regex = new RegExp('\\b' + obf + '\\b', 'g');
    finalContent = finalContent.replace(regex, clean);
}

// Global cleanup
finalContent = finalContent.replace(/!\[\]/g, "false");
finalContent = finalContent.replace(/!!\[\]/g, "true");
finalContent = finalContent.replace(/\["([^"]+)"\]/g, ".$1"); // object["prop"] -> object.prop
finalContent = finalContent.replace(/\['([^']+)'\]/g, ".$1"); // object['prop'] -> object.prop

// Formatting fix for method calls that might have been mangled
finalContent = finalContent.replace(/ \.([a-zA-Z0-9_$]+)\(/g, ".$1(");

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/whatsappLogin_final.js', finalContent);
console.log("Created whatsappLogin_final.js");
