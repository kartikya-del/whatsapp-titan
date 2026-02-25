const fs = require('fs');
const path = require('path');

function restoreStringsInFile(filePath) {
    console.log(`Restoring strings in ${filePath}...`);
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Identify the string array function
    // Usually: function _0x2097(){const _0x2e5219=['string1','string2',...];...}
    const arrayMatch = content.match(/function\s+(\w+)\s*\(\)\s*{\s*const\s+\w+=\s*(\[[^\]]+\]);/);
    if (!arrayMatch) {
        console.log("Could not find string array");
        return;
    }
    const funcName = arrayMatch[1];
    const strings = eval(arrayMatch[2]);

    // 2. Identify the resolver function
    // Usually: function _0x532e(_0x461edd,_0x58452c){_0x461edd=_0x461edd-174; ... }
    const resolverMatch = content.match(/function\s+(\w+)\s*\((_0x[a-f0-9]+),\s*_0x[a-f0-9]+\)\s*{\s*\2=\s*\2-(\d+);/);
    if (!resolverMatch) {
        console.log("Could not find resolver function");
        return;
    }
    const resolverName = resolverMatch[1];
    const offset = parseInt(resolverMatch[3]);

    // 3. Create a simplistic resolver for this pass
    const resolve = (idx) => strings[idx - offset];

    // 4. Replace resolver calls
    // Pattern: _0x532e(876, 'pku4')
    // We only care about the first argument (index)
    const callRegex = new RegExp(`${resolverName}\\s*\\(\\s*(\\d+)[^)]*\\)`, 'g');

    let restored = content.replace(callRegex, (match, idx) => {
        const val = resolve(parseInt(idx));
        return val ? `'${val.replace(/'/g, "\\'")}'` : match;
    });

    // 5. Cleanup syntax (split strings, etc.)
    restored = restored.replace(/'\s*\+\s*'/g, '');
    restored = restored.replace(/"\s*\+\s*"/g, '');
    restored = restored.replace(/(\bthis|[\w$]+)\[['"]([a-zA-Z_$][\w$]*)['"]\]/g, '$1.$2');

    // 6. Basic variable renaming (from our map)
    const COMMON_RENAMES = {
        '_0x55557e': 'd',
        '_0x532e': 'd',
        '_0x2097': 'strings',
        // Common method names from 1.0.10
        'checkLimit': 'checkLimit', // already plain
    };

    const keys = Object.keys(COMMON_RENAMES).sort((a, b) => b.length - a.length);
    for (const key of keys) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        restored = restored.replace(regex, COMMON_RENAMES[key]);
    }

    fs.writeFileSync(filePath, restored);
    console.log(`Restored ${filePath}`);
}

const DIR = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-final';
fs.readdirSync(path.join(DIR, 'engine')).forEach(f => {
    if (f.endsWith('.js')) restoreStringsInFile(path.join(DIR, 'engine', f));
});
restoreStringsInFile(path.join(DIR, 'electron/preload.js'));
restoreStringsInFile(path.join(DIR, 'electron/main.js'));
