const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * Preload script for LeadTitan.
 * Safely exposes back-end logic to the renderer process via contextBridge.
 */

console.log('[PRELOAD] Secure bridge initializing...');

contextBridge.exposeInMainWorld('api', {
    // Utilities
    getPathForFile: (file) => webUtils.getPathForFile(file),

    // Account Management
    startAddAccount: (number) => ipcRenderer.send('account:add:start', { number }),
    getAccounts: () => ipcRenderer.invoke('accounts:list'),
    getAccountData: (number) => ipcRenderer.invoke('account:data', number),
    closeAccount: (number) => ipcRenderer.send('account:close', { number }),
    removeAccount: (number) => ipcRenderer.send('account:remove', { number }),
    clearAccountCache: (number) => ipcRenderer.send('account:cache:clear', { number }),
    reconnectAccounts: () => ipcRenderer.invoke('accounts:reconnect'),

    // Extraction
    getGroups: (number) => ipcRenderer.send('account:groups:list', { number }),
    startExtraction: (number, groupIds) => ipcRenderer.send('account:extract:start', { number, groupIds }),
    stopExtraction: (number) => ipcRenderer.send('account:extract:stop', { number }),
    clearContacts: (number) => ipcRenderer.send('account:contacts:clear', { number }),
    clearAllData: (number) => ipcRenderer.send('account:all:clear', { number }),
    exportToExcel: (data) => ipcRenderer.send('account:exportToExcel', data),
    importExclusion: (data) => ipcRenderer.send('account:exclusion:import', data),

    // Campaigns
    campaignCreate: (data) => ipcRenderer.invoke('campaign:create', data),
    campaignStart: (data) => ipcRenderer.send('campaign:start', data),
    campaignPause: () => ipcRenderer.send('campaign:pause'),
    campaignResume: () => ipcRenderer.send('campaign:resume'),
    campaignStop: () => ipcRenderer.send('campaign:stop'),
    campaignStatus: (data) => ipcRenderer.invoke('campaign:status', data),
    importCampaignLeads: () => ipcRenderer.invoke('campaign:importLeads'),
    updateWorkerConfig: (data) => ipcRenderer.send('worker:update-config', data),
    updateAutoReplySettings: (data) => ipcRenderer.send('campaign:updateAutoReply', data),

    // Number Warmer
    getWarmerState: () => ipcRenderer.invoke('warmer:get-state'),
    toggleWarmer: (enabled) => ipcRenderer.send('warmer:toggle', { enabled }),

    // License & System
    validateLicense: (key) => ipcRenderer.invoke('license:validate', key),
    getLicenseStatus: () => ipcRenderer.invoke('license:status'),
    startFreeTrial: () => ipcRenderer.invoke('license:trial'),
    getUsage: () => ipcRenderer.invoke('license:usage'),
    resetLicense: () => ipcRenderer.invoke('license:reset'),
    getLicenseExpiry: () => ipcRenderer.invoke('license:expiry'),
    factoryReset: () => ipcRenderer.invoke('system:factory-reset'),
    checkTrialLimit: (data) => ipcRenderer.invoke('trial:check-limit', data),
    consumeTrialLimit: (data) => ipcRenderer.invoke('trial:consume', data),

    // Global Controls
    getSurvivabilityStats: () => ipcRenderer.invoke('account:survivability:stats'),
    emergencyStopAll: () => ipcRenderer.send('account:emergency:stop'),
    setStealthMode: (enabled) => ipcRenderer.send('account:stealth:toggle', { enabled }),
    configGet: () => ipcRenderer.invoke('config:get'),
    configSave: (data) => ipcRenderer.send('config:save', data),

    // Events (Main to Renderer)
    onQr: (cb) => ipcRenderer.on('account:qr', (e, d) => cb(d)),
    onAccountReady: (cb) => ipcRenderer.on('account:ready', (e, d) => cb(d)),
    onAccountDisconnected: (cb) => ipcRenderer.on('account:disconnected', (e, d) => cb(d)),
    onAccountError: (cb) => ipcRenderer.on('account:error', (e, d) => cb(d)),
    onAccountRemoved: (cb) => ipcRenderer.on('account:removed', (e, d) => cb(d)),
    onAccountClosed: (cb) => ipcRenderer.on('account:closed', (e, d) => cb(d)),

    onGroupsProgress: (cb) => ipcRenderer.on('account:groups-progress', (e, d) => cb(d)),
    onGroupsReceived: (cb) => ipcRenderer.on('account:groups-received', (e, d) => cb(d)),

    onExtractionStart: (cb) => ipcRenderer.on('account:extraction_start', (e, d) => cb(d)),
    onExtractionProgress: (cb) => ipcRenderer.on('account:extraction_progress', (e, d) => cb(d)),
    onExtractionComplete: (cb) => ipcRenderer.on('account:extraction-complete', (e, d) => cb(d)),

    onMetadataProgress: (cb) => ipcRenderer.on('account:metadata-progress', (e, d) => cb(d)),
    onExclusionDone: (cb) => ipcRenderer.on('account:exclusion-done', (e, d) => cb(d)),
    onAccountExported: (cb) => ipcRenderer.on('account:exported', (e, d) => cb(d)),

    onCampaignProgress: (cb) => ipcRenderer.on('campaign:progress', (e, d) => cb(d)),
    onCampaignStateUpdated: (cb) => ipcRenderer.on('campaign:state:updated', (e, d) => cb(d)),
    onCampaignStatusUpdate: (cb) => ipcRenderer.on('account:campaign-status', (e, d) => cb(d)),

    onWarmerUpdate: (cb) => ipcRenderer.on('warmer:update', (e, d) => cb(d)),
    onLicenseLock: (cb) => ipcRenderer.on('license:lock', (e, d) => cb(d))
});

console.log('[PRELOAD] Secure bridge established.');