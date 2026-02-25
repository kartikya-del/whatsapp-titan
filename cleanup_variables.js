const fs = require('fs');
const path = require('path');

const COMMON_RENAMES = {
    '_0x57f196': 'number',
    '_0x576b2e': 'sessionPath',
    '_0x1d3646': 'registry',
    '_0x5b3918': 'replySettings',
    '_0x32511e': 'eState',
    '_0xa45af3': 'settings',
    '_0x4be53a': 'contacts',
    '_0x4f5010': 'newCount',
    '_0x465b47': 'contact',
    '_0xf0a4e': 'contactKey',
    '_0x26b4d5': 'd', // Shortcut for the resolver
};

function processFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');

    const keys = Object.keys(COMMON_RENAMES).sort((a, b) => b.length - a.length);
    for (const key of keys) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        content = content.replace(regex, COMMON_RENAMES[key]);
    }

    // Also cleanup some common obfuscated patterns if possible
    // ![] -> false, !![] -> true
    content = content.replace(/!\[\]/g, 'false');
    content = content.replace(/!!\[\]/g, 'true');
    // 0x... -> decimal
    content = content.replace(/\b0x([a-fA-F0-9]+)\b/g, (match, hex) => parseInt(hex, 16).toString());

    fs.writeFileSync(filePath, content);
}

const DIR = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-final';
processFile(path.join(DIR, 'engine/ExtractionWorker.js'));
processFile(path.join(DIR, 'engine/ExtractionManager.js'));
processFile(path.join(DIR, 'engine/AccountRegistry.js'));
processFile(path.join(DIR, 'engine/CampaignManager.js'));
