const fs = require('fs');
const path = require('path');

function joinSplitStrings(content) {
    // Join 'abc' + 'def' and "abc" + "def"
    let joined = content;
    // Handle ' + '
    joined = joined.replace(/'\s*\+\s*'/g, '');
    // Handle " + "
    joined = joined.replace(/"\s*\+\s*"/g, '');
    // Handle mixed (rare but possible)
    // joined = joined.replace(/'\s*\+\s*"/g, ...); // skip for now
    return joined;
}

function convertToDotNotation(content) {
    // this['property'] -> this.property
    // Only for alphanumeric properties
    return content.replace(/(\bthis|[\w$]+)\[['"]([a-zA-Z_$][\w$]*)['"]\]/g, '$1.$2');
}

function processFile(filePath) {
    console.log(`Cleaning up ${filePath}...`);
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');

    content = joinSplitStrings(content);
    content = convertToDotNotation(content);

    fs.writeFileSync(filePath, content);
}

const DIR = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-final';
processFile(path.join(DIR, 'engine/ExtractionWorker.js'));
processFile(path.join(DIR, 'engine/ExtractionManager.js'));
processFile(path.join(DIR, 'engine/AccountRegistry.js'));
processFile(path.join(DIR, 'engine/CampaignManager.js'));
processFile(path.join(DIR, 'electron/preload.js'));
processFile(path.join(DIR, 'electron/main.js'));
