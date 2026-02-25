const fs = require('fs');
const path = require('path');

const RENAME_MAP_EXTRACTION_WORKER = {
    'groupHistory': '_groupCache',
    'contactsMemory': '_contactsMemory',
    'autoReplyConfig': 'autoReplySettings',
    'isWatchdogRunning': '_watchdogActive',
    'deduplicationSet': '_botSentBuffer',
    'responseLog': '_lastResponseTimes',
    'queuedReplies': '_pendingReplies',
    'startTime': '_botStartTime',
    'isBusy': '_isOccupied',
    'lastSyncTime': '_lastSimFinishedAt',
    'syncCooldown': '_nextRequiredGap',
    'workerState': 'extractionState',
    'messageHistoryBuffer': '_botSentBuffer',
    'setAutoReplyConfig': 'setAutoReplySettings',
    'dispatchQueuedReply': 'dispatchHumanReply',
    'safeEvaluate': '_safeEvaluate',
    'countGroupsMetadata': '_countMetadata',
    'ensureBridgeInstance': '_ensureBridge',
    'vaccinateStoreLogic': '_vaccinateStore',
    'delayAction': '_delay',
    'getGroupHistory': 'getGroupCache',
};

const RENAME_MAP_EXTRACTION_MANAGER = {
    'activeExtractions': 'extractions',
    'campaignStates': 'activeCampaigns',
    'isStealthEnabled': 'isStealth',
    'isPausedGlobally': 'isPaused',
    'autoReplyConfig': 'autoReplySettings',
    'workerOverrides': 'workerAutoReplyOverrides',
    'marketingLedger': 'outboundLedger',
    'ledgerFilePath': 'ledgerPath',
    'loadMarketingLedger': '_loadLedger',
    'saveMarketingLedger': '_saveLedger',
    'setAutoReplyConfig': 'setAutoReplySettings',
    'updateWorkerReplyConfig': 'updateWorkerConfig',
    'setGlobalStealth': 'setStealthMode',
    'pauseProcessing': 'pauseAll',
    'resumeProcessing': 'resumeAll',
    'initializeAccount': 'startAccount',
    'ensureWorkerAvailable': '_ensureWriterReady',
    'listAccountGroups': 'getGroups',
    'processGroupExtraction': 'extractGroups',
    'shutdownAccount': 'closeAccount',
    'shutdownAllAccounts': 'closeAll',
    'abortOutreach': 'stopAllCampaigns',
    'executeTargetedCampaign': 'runCampaignForNumber',
    'handleMessageInbound': '_handleIncomingMessage',
};

const RENAME_MAP_ACCOUNT_REGISTRY = {
    'accountsPath': 'accountsDir',
    'logsPath': 'logsDir',
    'usageFilePath': 'usageFile',
    'loadRegisteredAccounts': '_loadAccounts',
    'loadDailyUsage': '_loadUsage',
    'persistDailyUsage': '_persistUsage',
    'getTodayString': '_today',
    'ensureDateContext': '_ensureDate',
    'clearChromiumLocks': '_cleanupLockFiles',
    'getAccountList': 'listAccounts',
    'getAccountDetails': 'getAccount',
    'registerNewSession': 'createSession',
    'storeExtractionPoint': 'saveExtractionState',
    'removeAccountSession': 'deleteAccount',
    'loadExtractionPoint': 'getExtractionState',
    'clearExtractionPoint': 'clearExtractionState',
    'checkUsageLimit': 'canConsume',
    'recordUsage': 'consume',
};

const RENAME_MAP_CAMPAIGN_MANAGER = {
    'campaignsDirectory': 'campaignsDir',
    'queuesMap': 'activeQueues',
    'initiateCampaign': 'createCampaign',
    'getCampaignData': 'getCampaignStatus',
    'getQueueFile': 'getQueue',
    'updateQueueState': 'updateQueueProgress',
    'trackVariantSent': 'incrementVariantSent',
    'trackVariantReply': 'incrementVariantReply',
    'importLeads': 'parseLeadsFile',
};

const RENAME_MAP_PRELOAD = {
    'getFilePath': 'getPathForFile',
    'initiateAddAccount': 'startAddAccount',
    'fetchGroups': 'getGroups',
    'fetchAccounts': 'getAccounts',
    'beginExtraction': 'startExtraction',
    'haltExtraction': 'stopExtraction',
    'exportLeads': 'exportToExcel',
    'deleteAccount': 'removeAccount',
    'wipeAccountCache': 'clearAccountCache',
    'exitAccount': 'closeAccount',
    'importExclusionData': 'importExclusion',
    'importExclusionFile': 'importExclusionList',
    'onQrUpdate': 'onQr',
    'onAccountStatusReady': 'onAccountReady',
    'onAccountDeleted': 'onAccountRemoved',
    'onExportFinished': 'onAccountExported',
    'onGroupsLoaded': 'onGroupsReceived',
    'onExtractionProgressUpdate': 'onExtractionProgress',
    'onExtractionFinished': 'onExtractionComplete',
    'onAccountFailure': 'onAccountError',
    'onAccountLost': 'onAccountDisconnected',
    'onNewMessage': 'onMessageReceived',
    'onBotStatus': 'onBotActivity',
    'onGroupsDiscoveryProgress': 'onGroupsProgress',
    'onMetadataSync': 'onMetadataProgress',
    'onAccountTerminated': 'onAccountClosed',
    'onExclusionProcessingFinished': 'onExclusionDone',
    'haltAllOperations': 'emergencyStopAll',
    'toggleStealthMode': 'setStealthMode',
    'onCampaignFeed': 'onCampaignProgress',
    'onCampaignStateChange': 'onCampaignStateUpdated',
    'onCampaignStatusChange': 'onCampaignStatusUpdate',
    'onConnectionLost': 'onNetworkLost',
    'onConnectionRestored': 'onNetworkRestored',
    'resumeOutreach': 'campaignResume',
    'pauseOutreach': 'campaignPause',
    'stopOutreach': 'campaignStop',
    'createOutreachCampaign': 'campaignCreate',
    'startOutreachCampaign': 'campaignStart',
    'fetchCampaignStatus': 'campaignStatus',
    'loadOutreachLeads': 'importCampaignLeads',
    'modifyWorkerConfig': 'updateWorkerConfig',
    'modifyAutoReplyConfig': 'updateAutoReplySettings',
    'fetchConfig': 'configGet',
    'saveConfig': 'configSave',
    'generateAiVariants': 'aiGenerateVariants',
};

function applyRenaming(content, renameMap) {
    let newContent = content;
    const keys = Object.keys(renameMap).sort((a, b) => b.length - a.length);
    for (const key of keys) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        newContent = newContent.replace(regex, renameMap[key]);
    }
    return newContent;
}

function processFile(filePath, renameMap, outputSuffix) {
    console.log(`Processing ${filePath}...`);
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const renamed = applyRenaming(content, renameMap);
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);

    // Final destination is recovered-project/ (without _restored/_final)
    const finalDir = dir.replace('recovered-project', 'recovered-project-final');
    if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

    const finalBase = base.replace('_restored', '').replace('_final', '');
    const outputPath = path.join(finalDir, finalBase + ext);

    fs.writeFileSync(outputPath, renamed);
    console.log(`Saved to ${outputPath}`);
}

const ROOT = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project';

processFile(path.join(ROOT, 'engine/ExtractionWorker_restored.js'), RENAME_MAP_EXTRACTION_WORKER, '');
processFile(path.join(ROOT, 'engine/ExtractionManager_restored.js'), RENAME_MAP_EXTRACTION_MANAGER, '');
processFile(path.join(ROOT, 'engine/AccountRegistry_restored.js'), RENAME_MAP_ACCOUNT_REGISTRY, '');
processFile(path.join(ROOT, 'engine/CampaignManager_restored.js'), RENAME_MAP_CAMPAIGN_MANAGER, '');
processFile(path.join(ROOT, 'electron/preload.js'), RENAME_MAP_PRELOAD, '');
// For main.js, I should check if I have a restored version.
// I'll check ROOT/electron/main.js
processFile(path.join(ROOT, 'electron/main.js'), {}, ''); // No rename map yet, but just copy to final
