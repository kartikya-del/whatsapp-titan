const fs = require('fs');

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/electron/preload_restored.js';
let content = fs.readFileSync(filePath, 'utf8');

let finalContent = content;

// Remove anti-debug / self-defending junk
finalContent = finalContent.replace(/const _0x504abc = \(function\(\) \{[\s\S]*?_0xbe6289\(\);\s*/, "");
finalContent = finalContent.replace(/const _0xa6cecf = \(function\(\) \{[\s\S]*?\}\(\)\);\s*/, "");
finalContent = finalContent.replace(/\(function\(\) \{[\s\S]*?console\.log\('\[PRELOAD\] QR[\s\S]*?\}\(\)\);\s*/, "");
finalContent = finalContent.replace(/\(function\(\) \{[\s\S]*?_0x495c39.setInterval\(_0x1e125c, 0x7d0\);\s*\}\(\)\);/, "");

// Fix string concatenations and property Access
finalContent = finalContent.replace(/'\s*\+\s*'/g, ""); // 'a' + 'b' -> 'ab'
finalContent = finalContent.replace(/\\x([0-9a-fA-F]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
finalContent = finalContent.replace(/\["([^"]+)"\]/g, ".$1");
finalContent = finalContent.replace(/\['([^']+)'\]/g, ".$1");

// Rename variables
const renameMap = {
    'contextBridge': 'bridge',
    'ipcRenderer': 'ipc',
    'webUtils': 'utils',
    '_0x184060': 'file',
    '_0x276fc0': 'number',
    '_0x7dcef4': 'number',
    '_0x5b3142': 'number',
    '_0x8fc644': 'groupIds',
    '_0x85f6c1': 'number',
    '_0x17da63': 'number',
    '_0xc3d51e': 'number',
    '_0xbdc9e6': 'filePath',
    '_0x45ff58': 'number',
    '_0x20eacc': 'filePath',
    '_0x19c089': 'number',
    '_0xf5baa4': 'callback',
    '_0x2d8aa4': 'callback',
    '_0x1cacd1': 'callback',
    '_0x17e82a': 'callback',
    '_0x2e9055': 'callback',
    '_0x36b446': 'callback',
    '_0x5d0606': 'callback',
    '_0x4d851': 'callback',
    '_0x1dbb7a': 'callback',
    '_0x11bf86': 'callback',
    '_0x3dab48': 'callback',
    '_0x1fb3ba': 'callback',
    '_0x4cd423': 'callback',
    '_0x6d2ed5': 'callback',
    '_0x353380': 'callback',
    '_0x4e88d3': 'callback',
    '_0x5668bf': 'enabled',
    '_0x3368f6': 'callback',
    '_0x35a80f': 'callback',
    '_0x41fc11': 'callback',
    '_0x256cdd': 'callback',
    '_0x483c56': 'callback',
    '_0x37a532': 'callback',
    '_0x5b34ce': 'callback',
    '_0x231c5c': 'number',
    '_0x4ee90f': 'license'
};

for (const [obf, clean] of Object.entries(renameMap)) {
    const regex = new RegExp('\\b' + obf + '\\b', 'g');
    finalContent = finalContent.replace(regex, clean);
}

// Cleanup ![] / !![]
finalContent = finalContent.replace(/!\[\]/g, "false");
finalContent = finalContent.replace(/!!\[\]/g, "true");

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/electron/preload_final.js', finalContent);
console.log("Created preload_final.js");
