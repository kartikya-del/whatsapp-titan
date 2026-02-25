const fs = require('fs');
const path = require('path');

const REPLACEMENTS = {
    // Methods
    'checkLimit': 'checkLimit',
    'getSurvivabilityStats': 'getSurvivabilityStats',
    'recordOutreachStrike': 'recordOutreachStrike',
    'recordAckEvent': 'recordAckEvent',
    'setAutoReplySettings': 'setAutoReplySettings',
    'updateWorkerConfig': 'updateWorkerConfig',
    'setStealthMode': 'setStealthMode',
    'pauseAll': 'pauseAll',
    'resumeAll': 'resumeAll',
    'startAccount': 'startAccount',
    'getGroups': 'getGroups',
    'extractGroups': 'extractGroups',
    'clearContacts': 'clearContacts',
    'clearAllData': 'clearAllData',
    'closeAccount': 'closeAccount',
    'closeAll': 'closeAll',
    'stopAllCampaigns': 'stopAllCampaigns',
    'runCampaignForNumber': 'runCampaignForNumber',

    // Properties
    'registry': 'registry',
    'campaignManager': 'campaignManager',
    'licenseManager': 'licenseManager',
    'workers': 'workers',
    'extractions': 'extractions',
    'activeCampaigns': 'activeCampaigns',
    'isStealth': 'isStealth',
    'isPaused': 'isPaused',
    'autoReplySettings': 'autoReplySettings',
    'workerAutoReplyOverrides': 'workerAutoReplyOverrides',
    'outboundLedger': 'outboundLedger',
    'survivability': 'survivability',
    'engine': 'engine',

    // Common local vars
    '_0x311b47': 'number',
    '_0x42f4aa': 'from',
    '_0xe0159e': 'body',
    '_0x20e3d4': 'fromMe',
    '_0x8d5f32': 'isBot',
    '_0x1c51a6': 'timestamp',
};

function finalizeFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Rename any remaining hex vars that we mapped
    for (const [oldName, newName] of Object.entries(REPLACEMENTS)) {
        content = content.replace(new RegExp(`\\b${oldName}\\b`, 'g'), newName);
    }

    // Join any remaining strings
    content = content.replace(/'\s*\+\s*'/g, '');
    content = content.replace(/"\s*\+\s*"/g, '');

    // Bracket to dot
    content = content.replace(/(\bthis|[\w$]+)\[['"]([a-zA-Z_$][\w$]*)['"]\]/g, '$1.$2');

    fs.writeFileSync(filePath, content);
}

const DIR = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-final';
const files = [
    'engine/ExtractionManager.js',
    'engine/ExtractionWorker.js',
    'engine/CampaignManager.js',
    'engine/AccountRegistry.js',
    'electron/main.js',
    'electron/preload.js'
];

files.forEach(f => finalizeFile(path.join(DIR, f)));
console.log("Finalized all files.");
