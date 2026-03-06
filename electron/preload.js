const { contextBridge, ipcRenderer, webUtils } = require('electron')

console.log('[PRELOAD] Loading restored Titan preload script...')

contextBridge.exposeInMainWorld('api', {
    getPathForFile: (file) => webUtils.getPathForFile(file),

    // Account management
    startAddAccount: (number) => {
        ipcRenderer.send('account:add:start', { number })
    },

    getGroups: (number) => {
        ipcRenderer.send('account:groups:list', { number })
    },

    startExtraction: (number, groupIds) => {
        ipcRenderer.send('account:extract:start', { number, groupIds })
    },

    stopExtraction: (number) => {
        ipcRenderer.send('account:extract:stop', { number })
    },

    toggleGroupSelection: (number, groupId, isSelected) => {
        ipcRenderer.send('extraction:selection:toggle', { number, groupId, isSelected })
    },

    selectAllGroups: (number, isAll) => {
        ipcRenderer.send('extraction:selection:all', { number, isAll })
    },

    clearUIMetrics: (number) => {
        ipcRenderer.send('extraction:clear-ui', { number })
    },

    clearAllData: (number) => {
        ipcRenderer.send('account:clear-all-data', { number })
    },

    exportToExcel: ({ number, contacts, mode }) => {
        ipcRenderer.send('account:exportToExcel', { number, contacts, mode })
    },

    removeAccount: (number) => {
        ipcRenderer.send('account:remove', { number })
    },

    clearAccountCache: (number) => {
        ipcRenderer.send('account:cache:clear', { number })
    },

    closeAccount: (number) => {
        ipcRenderer.send('account:close', { number })
    },

    setActiveAccount: (number) => {
        ipcRenderer.send('account:set-active', { number })
    },

    getAccounts: async () => {
        return await ipcRenderer.invoke('accounts:list')
    },

    importExclusion: ({ filePath, number }) => {
        ipcRenderer.send('account:exclusion:import', { filePath, number })
    },

    importExclusionList: (filePath, number) => {
        ipcRenderer.send('account:exclusion:import', { filePath, number })
    },

    // --- TITAN 5-LANE HIGHWAY BRIDGE ---
    onHighwayCommand: (cb) => ipcRenderer.on('highway:command', (e, d) => cb(d)),
    onHighwayTurbo: (cb) => ipcRenderer.on('highway:turbo', (e, d) => cb(d)),
    onHighwayDiscovery: (cb) => ipcRenderer.on('highway:discovery', (e, d) => cb(d)),
    onHighwayPulse: (cb) => ipcRenderer.on('highway:pulse', (e, d) => cb(d)),
    onHighwaySystem: (cb) => ipcRenderer.on('highway:system', (e, d) => cb(d)),

    // --- ESSENTIAL ACCOUNT EVENT BRIDGES ---
    onAccountExported: (cb) => ipcRenderer.on('account:exported', (e, d) => cb(d)),
    onAccountError: (cb) => ipcRenderer.on('account:error', (e, d) => cb(d)),
    onAccountRemoved: (cb) => ipcRenderer.on('account:removed', (e, d) => cb(d)),
    onAccountDisconnected: (cb) => ipcRenderer.on('account:disconnected', (e, d) => cb(d)),

    // --- LICENSE EXPIRY (Stub — no backend handler exists yet) ---
    getLicenseExpiry: async () => ({ hasExpiry: false, expired: false, daysLeft: 999 }),

    // --- ACCOUNT DATA HYDRATION ---
    getAccountData: async (number) => ipcRenderer.invoke('account:data', { number }),

    // --- RECONNECT (post-license activation) ---
    reconnectAccounts: () => ipcRenderer.send('accounts:reconnect'),

    onCampaignProgress: (callback) => {
        ipcRenderer.on('campaign:progress', (event, data) => callback(data))
    },
    onCampaignStateUpdated: (callback) => {
        ipcRenderer.on('campaign:state:updated', (event, data) => callback(data))
    },
    onCampaignStatusUpdate: (callback) => {
        ipcRenderer.on('campaign:status:update', (event, data) => callback(data))
    },

    onNetworkLost: (callback) => {
        ipcRenderer.on('guardian:network:lost', () => callback())
    },

    onNetworkRestored: (callback) => {
        ipcRenderer.on('guardian:network:restored', () => callback())
    },

    onExclusionDone: (callback) => {
        ipcRenderer.on('account:exclusion:done', (event, data) => callback(data))
    },

    emergencyStopAll: () => {
        ipcRenderer.send('account:emergency:stop')
    },

    setStealthMode: (enabled) => {
        ipcRenderer.send('account:stealth:toggle', { enabled })
    },

    campaignResume: () => {
        ipcRenderer.send('campaign:resume')
    },

    campaignPause: () => {
        ipcRenderer.send('campaign:pause')
    },

    campaignStop: () => {
        ipcRenderer.send('campaign:stop')
    },

    // Industrial Outreach & Excel
    campaignCreate: async ({ leads, mapping, variants }) => {
        return await ipcRenderer.invoke('campaign:create', { leads, mapping, variants })
    },

    campaignStart: ({ campaignId, mapping, options }) => {
        ipcRenderer.send('campaign:start', { campaignId, mapping, options })
    },

    campaignStatus: async (campaignId) => {
        return await ipcRenderer.invoke('campaign:status', { campaignId })
    },

    importCampaignLeads: async () => {
        return await ipcRenderer.invoke('campaign:importLeads')
    },
    updateWorkerConfig: (data) => {
        ipcRenderer.send('worker:update-config', data)
    },
    updateAutoReplySettings: (settings) => {
        ipcRenderer.send('campaign:updateAutoReply', settings)
    },
    // Config & AI Persistence
    configGet: async () => ipcRenderer.invoke('config:get'),
    configSave: (data) => ipcRenderer.send('config:save', data),
    aiGenerateVariants: async ({ apiKey, baseMessage, customPrompt, count }) => {
        return await ipcRenderer.invoke('ai:generate-variants', { apiKey, baseMessage, customPrompt, count })
    },

    // License Handlers (Security Preservation)
    getLicenseStatus: () => ipcRenderer.invoke('license:status'),
    validateLicense: (key) => ipcRenderer.invoke('license:validate', key),
    startFreeTrial: () => ipcRenderer.invoke('license:startTrial'),
    onLicenseLock: (cb) => ipcRenderer.on('license:lock', (e, d) => cb(d)),

    // Warmer & Survivability (Titan 1.0.11 Hybrid)
    getSurvivabilityStats: () => ipcRenderer.invoke('survivability:stats'),
    getWarmerState: () => ipcRenderer.invoke('warmer:get-state'),
    toggleWarmer: (enabled) => ipcRenderer.send('warmer:toggle', { enabled }),
    onWarmerUpdate: (cb) => ipcRenderer.on('warmer:update', (e, d) => cb(d))
})
