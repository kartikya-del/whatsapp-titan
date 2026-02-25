/**
 * Titan 3.0 — Pre-build Obfuscator
 * Obfuscates engine/ and electron/ before electron-builder packages the .asar
 *
 * Run: node scripts/obfuscate.js
 * Then: npm run dist
 */

const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Folders to obfuscate (relative to project root)
const TARGETS = ['engine', 'electron'];

// Output goes to same location — overwrites source (run on copies during CI,
// or restore from git after build)
const OBFUSCATE_OPTIONS = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.2,
    debugProtection: true,   // Blocks debugger attach
    debugProtectionInterval: 2000,   // Re-checks every 2s
    disableConsoleOutput: false,  // Keep console for error tracking
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,  // Keep Node.js globals intact
    rotateStringArray: true,
    selfDefending: true,   // Anti-tamper
    shuffleStringArray: true,
    splitStrings: true,
    splitStringsChunkLength: 6,
    stringArray: true,
    stringArrayEncoding: ['rc4'],
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false,
    // Exclude patterns that break Node.js / Electron internals
    reservedNames: ['^require$', '^module$', '^exports$', '^__dirname$', '^__filename$', '^process$', '^Buffer$'],
};

function getAllJsFiles(dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(getAllJsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            results.push(fullPath);
        }
    }
    return results;
}

let totalFiles = 0;
let errors = 0;

for (const target of TARGETS) {
    const targetDir = path.join(ROOT, target);
    if (!fs.existsSync(targetDir)) {
        console.warn(`[OBFUSCATE] Skipping missing dir: ${target}`);
        continue;
    }

    const files = getAllJsFiles(targetDir);
    console.log(`[OBFUSCATE] Processing ${files.length} files in ${target}/`);

    for (const file of files) {
        try {
            const source = fs.readFileSync(file, 'utf8');
            const result = JavaScriptObfuscator.obfuscate(source, OBFUSCATE_OPTIONS);
            fs.writeFileSync(file, result.getObfuscatedCode(), 'utf8');
            totalFiles++;
            console.log(`  ✅ ${path.relative(ROOT, file)}`);
        } catch (err) {
            errors++;
            console.error(`  ❌ FAILED: ${path.relative(ROOT, file)} — ${err.message}`);
        }
    }
}

console.log(`\n[OBFUSCATE] Done. ${totalFiles} file(s) obfuscated. ${errors} error(s).`);
if (errors > 0) {
    console.error('[OBFUSCATE] Some files failed — review before shipping.');
    process.exit(1);
}
