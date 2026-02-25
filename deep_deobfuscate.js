const fs = require('fs');
const path = require('path');

function deobfuscateFile(filePath) {
    console.log(`Deep deobfuscating ${filePath}...`);
    let content = fs.readFileSync(filePath, 'utf8');

    const headerEndIndex = content.indexOf('const EventEmitter');
    if (headerEndIndex === -1) return;

    const header = content.substring(0, headerEndIndex);
    const body = content.substring(headerEndIndex);

    const resolverMatch = header.match(/function\s+(\w+)\s*\(\w+,\s*\w+\)\s*{\s*\w+=\s*\w+-\d+;/);
    if (!resolverMatch) return;
    const resolverName = resolverMatch[1];

    try {
        const fullScope = header + `; global.TEMP_RESOLVER = ${resolverName};`;
        eval(fullScope);
        const resolver = global.TEMP_RESOLVER;

        const callRegex = new RegExp(`${resolverName}\\s*\\(\\s*(\\d+),\\s*'([^']+)'\\s*\\)`, 'g');
        let bodyRestored = body.replace(callRegex, (match, idx, key) => {
            try {
                const val = resolver(parseInt(idx), key);
                return `'${val.replace(/'/g, "\\'")}'`;
            } catch (e) {
                return match;
            }
        });

        bodyRestored = bodyRestored.replace(/'\s*\+\s*'/g, '');
        bodyRestored = bodyRestored.replace(/"\s*\+\s*"/g, '');
        bodyRestored = bodyRestored.replace(/(\bthis|[\w$]+)\[['"]([a-zA-Z_$][\w$]*)['"]\]/g, '$1.$2');

        fs.writeFileSync(filePath, header + bodyRestored);
        console.log(`Successfully deobfuscated ${filePath}`);
    } catch (e) {
        console.error(`Failed to deobfuscate ${filePath}: ${e.message}`);
    }
}

const DIR = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-final';
deobfuscateFile(path.join(DIR, 'engine/ExtractionManager.js'));
deobfuscateFile(path.join(DIR, 'engine/CampaignManager.js'));
deobfuscateFile(path.join(DIR, 'engine/ExtractionWorker.js'));
deobfuscateFile(path.join(DIR, 'engine/AccountRegistry.js'));
