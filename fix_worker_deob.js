const fs = require('fs');
const path = require('path');

function deobfuscateWorker() {
    const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-final/engine/ExtractionWorker.js';
    console.log(`Deobfuscating ${filePath}...`);
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Find the resolver function name and the string array logic
    // Usually starts with 'const _0x.... = (function() {'
    // It's the first big chunk of code.
    // In this file, it seems the header is from line 1 to around 133.
    // Let's look for 'class ExtractionWorker' - that's where the real code starts.
    const classIndex = content.indexOf('class ExtractionWorker');
    if (classIndex === -1) {
        console.error("Could not find ExtractionWorker class");
        return;
    }

    const header = content.substring(0, classIndex);
    const body = content.substring(classIndex);

    // Find the resolver name used in the body.
    // In 'getGroups', it says 'const _0x3a2872 = d;'
    // Wait, 'd' seems to be the common name for the resolver in the local scopes.
    // Let's find the ACTUAL resolver name at the top.
    // It's usually 'function d(...)'.
    const resolverMatch = header.match(/function\s+(\w+)\s*\(\w+,\s*\w+\)\s*{\s*\w+=\s*\w+-\d+;/);
    if (!resolverMatch) {
        console.error("Could not find resolver function in header");
        // Let's try finding the function that is assigned to global or used later.
        return;
    }
    const resolverName = resolverMatch[1];
    console.log(`Found resolver: ${resolverName}`);

    try {
        // Prepare a sandbox to execute the header
        // We need to define 'strings' and 'd' (or whatever they are named)
        // Since they are in the header, we can just eval the header.

        const sandbox = {
            console: console,
            global: {}
        };

        // The header contains some self-invoking functions that check the environment.
        // We might need to mock window/document if they are checked.
        // Actually, let's just extract the bits we need.

        // Create a function that returns the resolver
        const setupResolver = new Function('global', `
            ${header}
            return ${resolverName};
        `);

        const resolver = setupResolver(sandbox.global);

        // 2. Locate all variables that are assigned the resolver
        // Example: 'const _0x3a2872=d'
        // We'll search for 'const \w+ = resolverName'
        const aliasRegex = new RegExp(`const\\s+(\\w+)\\s*=\\s*${resolverName}\\b`, 'g');
        let match;
        const aliases = new Set([resolverName]);
        while ((match = aliasRegex.exec(body)) !== null) {
            aliases.add(match[1]);
        }
        console.log(`Aliases for resolver: ${Array.from(aliases)}`);

        // 3. Replace calls to these aliases
        // Pattern: alias(123, 'abcd')
        let newBody = body;
        for (const alias of aliases) {
            const callRegex = new RegExp(`${alias}\\s*\\(\\s*(\\d+),\\s*'([^']+)'\\s*\\)`, 'g');
            newBody = newBody.replace(callRegex, (match, idx, key) => {
                try {
                    const str = resolver(parseInt(idx), key);
                    // Escape single quotes for the resulting JS string literal
                    return `'${str.replace(/'/g, "\\'")}'`;
                } catch (e) {
                    console.error(`Failed to resolve ${match}: ${e.message}`);
                    return match;
                }
            });
        }

        // 4. Also look for aliases being assigned to other variables inside functions
        // Like 'const _0x2befcf=_0x3a2872;' (on line 951)
        // We should replace these assignments and their subsequent calls too.
        // But if we've replaced the calls, we should also clean up the variable definitions.

        // Let's do a second pass for deep aliases like _0x2befcf
        // Regex: const (\w+)\s*=\s*(alias1|alias2|...)
        const allAliasesArray = Array.from(aliases);
        const deepAliasRegex = new RegExp(`const\\s+(\\w+)\\s*=\\s*(${allAliasesArray.join('|')})\\b`, 'g');
        const deepAliases = new Map(); // child -> parent
        while ((match = deepAliasRegex.exec(newBody)) !== null) {
            deepAliases.set(match[1], match[2]);
        }
        console.log(`Deep aliases: ${Array.from(deepAliases.keys())}`);

        for (const [child, parent] of deepAliases) {
            const childCallRegex = new RegExp(`${child}\\s*\\(\\s*(\\d+),\\s*'([^']+)'\\s*\\)`, 'g');
            newBody = newBody.replace(childCallRegex, (match, idx, key) => {
                try {
                    const str = resolver(parseInt(idx), key);
                    return `'${str.replace(/'/g, "\\'")}'`;
                } catch (e) {
                    return match;
                }
            });
        }

        // Clean up: join strings one more time to handle cases like 'a' + 'b'
        // which might have been generated by our replacements or were there before.
        newBody = newBody.replace(/'\s*\+\s*'/g, '');

        // Final write
        fs.writeFileSync(filePath, header + newBody);
        console.log(`Successfully deobfuscated Worker!`);

    } catch (e) {
        console.error(`Error during deobfuscation: ${e.stack}`);
    }
}

deobfuscateWorker();
