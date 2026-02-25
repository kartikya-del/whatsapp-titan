const fs = require('fs');

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/ExtractionWorker_restored.js';
let content = fs.readFileSync(filePath, 'utf8');

const renameMap = {
    // Top Level
    '_0x2af6a4': 'createWrapper',
    '_0x350435': 'dummyInit',
    '_0x2c465c': 'antiDebugWrapper',
    '_0x2592': 'decoder',
    '_0x352073': 'integrityCheck',

    // ExtractionWorker Class members
    '_0x57f196': 'number',
    '_0x576b2e': 'sessionPath',
    '_0x1d3646': 'registry',

    // Properties
    '_groupCache': 'groupHistory',
    '_contactsCache': 'contactsMemory',
    'autoReplySettings': 'autoReplyConfig',
    '_watchdogActive': 'isWatchdogRunning',
    '_contactsKeySet': 'deduplicationSet',
    '_lastResponseTimes': 'responseLog',
    '_pendingReplies': 'queuedReplies',
    '_botStartTime': 'startTime',
    '_isOccupied': 'isBusy',
    '_lastSimFinishedAt': 'lastSyncTime',
    '_nextRequiredGap': 'syncCooldown',
    'extractionState': 'workerState',
    '_botSentBuffer': 'messageHistoryBuffer',

    // Internal class vars in methods
    '_0x56619e': 'd',
    '_0x3cb7da': 'd',
    '_0x3ae99b': 'd',
    '_0x2a4e6c': 'd',
    '_0x30bc1b': 'd',
    '_0x2d17d9': 'd',
    '_0xb467bf': 'd',
    '_0x19da58': 'd',
    '_0x5cfbc1': 'd',
    '_0x3a2872': 'd',
    '_0x1b430b': 'd',
    '_0x4f4a99': 'd',
    '_0x19f5b6': 'd',
    '_0x17cd92': 'd',

    // Helper objects
    '_0x5685ac': 'envConfig',
    '_0x5b3918': 'replyConfigInit',
    '_0x32511e': 'stateInit',
    '_0x544e0a': 'utils',
    '_0x2341a9': 'u',

    // Methods
    'initialize': 'start',
    'checkLoginStatus': 'isLoggedIn', // Assuming from logic
    'getQrCode': 'getQr',
    'extractContacts': 'scrapeContacts',
    'sendMessage': 'send',
    '_delay': 'sleep',
    'bringToFront': 'focusPage'
};

let finalContent = content;

// Aggressive junk removal
finalContent = finalContent.replace(/const _0x2af6a4 = \(function\(\) \{[\s\S]*?_0x350435\(\);\s*/, "");
finalContent = finalContent.replace(/const _0x2c465c = \(function\(\) \{[\s\S]*?\}\(\)\);\s*/, "");
finalContent = finalContent.replace(/\(function\(\) \{[\s\S]*?integrityCheck, 0x7d0\);\s*\}\(\)\);/, "");
finalContent = finalContent.replace(/function integrityCheck\(_0x165850\) \{[\s\S]*?\}\s*const \{/, "const {");

// Correct concatenations and strings
finalContent = finalContent.replace(/' \+ '/g, "");
finalContent = finalContent.replace(/\\x([0-9a-fA-F]{2})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));

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

// Common method fixes
finalContent = finalContent.replace(/d\((0x[0-9a-f]+),\s*'[^']+'\)/g, "/* string resolved */"); // Final cleanup for any missed calls

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/ExtractionWorker_final.js', finalContent);
console.log("Created ExtractionWorker_final.js");
