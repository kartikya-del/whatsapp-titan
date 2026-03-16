const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const XLSX = require('xlsx')

// Core Engines (Restored Behavioral Identity)
const ExtractionManager = require('../engine/ExtractionManager')
const AccountRegistry = require('../engine/AccountRegistry')
const CampaignManager = require('../engine/CampaignManager')
const LicenseManager = require('../engine/LicenseManager')
const WarmerManager = require('../engine/warmer/WarmerManager')

let mainWindow
let manager = null
let registry = null
let campaignManager = null
let licenseManager = null
let warmerManager = null

const userDataPath = app.getPath('userData')
const configPath = path.join(userDataPath, 'titan-config.json')

function ensureConfig() {
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({ variants: ["Hello {name}, hope you are doing well!"], autoReplyRules: [] }, null, 2))
    }
}

// =========================================================
// 1. IPC HANDLERS (Forensic Restoration of 1.0.10/1.0.11 Endpoints)
// =========================================================

// -- Config & Persistence --
ipcMain.handle('config:get', async () => {
    if (fs.existsSync(configPath)) {
        try { return JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch (e) { return {} }
    }
    return {}
})

ipcMain.on('config:save', (event, data) => {
    try {
        const current = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}
        const updated = { ...current, ...data }
        fs.writeFileSync(configPath, JSON.stringify(updated, null, 2))
    } catch (e) { console.error('[MAIN] Config Save Fail:', e) }
})

// -- Accounts --
ipcMain.handle('accounts:list', async () => {
    if (!registry) return []
    const list = registry.listAccounts()
    return list.map(acc => {
        const worker = manager?.workers.get(acc.number)
        let liveState = 'disconnected'
        if (worker) {
            const isBrowserAlive = worker.client?.pupBrowser?.isConnected()
            const isPageAlive = worker.client?.pupPage && !worker.client.pupPage.isClosed()
            if (worker.isReady && isBrowserAlive && isPageAlive) liveState = 'ready'
            else if (isBrowserAlive && isPageAlive) liveState = 'initializing'
            else liveState = 'disconnected'
        }
        const override = manager?.workerAutoReplyOverrides.get(acc.number)
        const autoReply = (override && typeof override.autoReply === 'boolean')
            ? override.autoReply
            : (manager?.autoReplySettings?.enabled || false)

        return { ...acc, liveState, autoReply }
    })
})

ipcMain.handle('account:data', async (e, { number }) => {
    if (!manager) return null
    const worker = manager.workers.get(number)
    if (!worker) return { groups: [], contacts: [] }
    return {
        groups: worker.groups || [],
        contacts: worker.contacts || []
    }
})

ipcMain.on('account:add:start', async (event, data) => {
    if (!manager || !registry) return
    const { number } = data
    if (registry.listAccounts().length >= 10) {
        return mainWindow?.webContents.send('account:error', {
            number,
            error: 'Maximum 10 accounts allowed. Please remove an account first.'
        })
    }
    try {
        registry.createSession(number)
        await manager.startAccount(number)
    } catch (err) {
        if (mainWindow) mainWindow.webContents.send('account:error', { number, error: err.message })
    }
})

ipcMain.on('account:remove', async (event, data) => {
    if (!manager || !registry) return
    try {
        await manager.closeAccount(data.number)
        registry.deleteAccount(data.number)
        mainWindow?.webContents.send('account:removed', { number: data.number })
    } catch (err) { console.error('[MAIN] Remove Fail:', err) }
})

ipcMain.on('account:cache:clear', async (event, data) => {
    if (!manager || !registry) return
    try {
        await manager.closeAccount(data.number)
        await new Promise(r => setTimeout(r, 3000))
        const acc = registry.getAccount(data.number)
        if (acc && fs.existsSync(acc.sessionPath)) {
            try {
                fs.rmSync(acc.sessionPath, { recursive: true, force: true })
            } catch (err) {
                await new Promise(r => setTimeout(r, 2000))
                fs.rmSync(acc.sessionPath, { recursive: true, force: true })
            }
            fs.mkdirSync(acc.sessionPath, { recursive: true })
        }
        mainWindow?.webContents.send('account:disconnected', { number: data.number })
    } catch (err) {
        mainWindow?.webContents.send('account:error', { number: data.number, error: 'Nuclear Wipe Failed.' })
    }
})

// -- AI Generation --

// -- Extraction --
ipcMain.on('account:groups:list', (e, d) => manager?.getGroups(d.number))

ipcMain.on('extraction:selection:toggle', (e, d) => manager?.toggleSelection(d.number, d.groupId, d.isSelected))
ipcMain.on('extraction:selection:all', (e, d) => manager?.selectAllGroups(d.number, d.isAll))
ipcMain.on('extraction:clear-ui', (e, d) => manager?.clearAccountBuffer(d.number))
ipcMain.on('account:clear-all-data', (e, d) => manager?.clearAccountData(d.number))
ipcMain.on('account:extract:start', async (e, d) => {
    try {
        const ids = (d.groupIds && d.groupIds.length > 0) ? d.groupIds : manager.getSelectedGroups(d.number);
        await manager?.extractGroups(d.number, ids)
    } catch (err) {
        mainWindow?.webContents.send('account:error', { number: d.number, error: err.message })
    }
})

ipcMain.on('account:extract:stop', (e, d) => manager?.stopExtraction(d.number))
ipcMain.on('account:set-active', (e, d) => manager?.syncAccountState(d.number))

ipcMain.on('account:exportToExcel', async (e, { number, contacts, mode }) => {
    try {
        const exportsRoot = path.join(app.getPath('documents'), 'WhatsApp Titan Exports')
        const accountDir = path.join(exportsRoot, number)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        if (!fs.existsSync(accountDir)) fs.mkdirSync(accountDir, { recursive: true })

        const sanitize = (name) => (name || 'Unknown').replace(/[\\\/\?\*\:\[\]\>\<\|]/g, '_').trim().substring(0, 60)

        if (mode === 'split') {
            const groups = {}
            contacts.forEach(c => {
                const key = c.sourceGroupId || 'unknown'
                if (!groups[key]) groups[key] = { name: sanitize(c.groupSource), rows: [] }
                groups[key].rows.push({ Phone: String(c.phone), Name: String(c.name || '') })
            })
            const groupFilesDir = path.join(accountDir, `groups_${timestamp}`)
            fs.mkdirSync(groupFilesDir, { recursive: true })
            for (const [gid, data] of Object.entries(groups)) {
                const workbook = XLSX.utils.book_new()
                const worksheet = XLSX.utils.json_to_sheet(data.rows)
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts')
                const suffix = gid.split('@')[0].slice(-4)
                XLSX.writeFile(workbook, path.join(groupFilesDir, `${data.name}_${suffix}.xlsx`))
            }
            shell.openPath(groupFilesDir)
            e.reply('account:exported', { number, path: groupFilesDir, count: contacts.length })
        } else if (mode === 'admins_only') {
            const adminContacts = contacts.filter(c => c.isAdmin)
            if (adminContacts.length === 0) return
            const adminFilesDir = path.join(accountDir, `admins_${timestamp}`)
            fs.mkdirSync(adminFilesDir, { recursive: true })
            const mergedWorkbook = XLSX.utils.book_new()
            const mergedRows = adminContacts.map(c => ({ Phone: String(c.phone), Name: String(c.name || ''), Group: String(c.groupSource || '') }))
            XLSX.utils.book_append_sheet(mergedWorkbook, XLSX.utils.json_to_sheet(mergedRows), 'All Admins')
            XLSX.writeFile(mergedWorkbook, path.join(adminFilesDir, `Admins_Merged_${number}.xlsx`))
            shell.openPath(adminFilesDir)
            e.reply('account:exported', { number, path: adminFilesDir, count: adminContacts.length })
        } else {
            const fileName = `All_Contacts_${number}_${timestamp}.xlsx`
            const filePath = path.join(accountDir, fileName)
            const rows = contacts.map(c => ({ Phone: String(c.phone), Name: String(c.name || ''), Group: String(c.groupSource || '') }))
            const workbook = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'All Contacts')
            XLSX.writeFile(workbook, filePath)
            shell.openPath(accountDir)
            e.reply('account:exported', { number, path: filePath, count: contacts.length })
        }
    } catch (err) { console.error('[MAIN] Export Fail:', err) }
})

ipcMain.on('account:exclusion:import', (e, { filePath, number }) => {
    try {
        const workbook = XLSX.readFile(filePath)
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])
        const excludedPhones = new Set()
        rows.forEach(row => {
            Object.values(row).forEach(val => {
                const s = String(val).replace(/\D/g, '')
                if (s.length >= 8) excludedPhones.add(s)
            })
        })
        mainWindow?.webContents.send('account:exclusion:done', { number, excludedArray: Array.from(excludedPhones) })
    } catch (err) { console.error('[MAIN] Exclusion Fail:', err) }
})

ipcMain.on('account:emergency:stop', () => manager?.closeAll())
ipcMain.on('account:stealth:toggle', (e, { enabled }) => manager?.setStealthMode(enabled))
ipcMain.on('campaign:updateAutoReply', (e, s) => manager?.setAutoReplySettings(s))
ipcMain.on('worker:update-config', (e, { number, config }) => manager?.updateWorkerConfig(number, config))

ipcMain.on('campaign:start', async (e, d) => {
    const staggerBase = d.options?.delayMin ? Math.max(5000, d.options.delayMin * 500) : 10000;
    for (const m of d.mapping) {
        const workerOptions = { ...d.options, ...m }
        manager?.runCampaignForNumber(m.number, d.campaignId, workerOptions)
        if (d.mapping.length > 1) {
            const stagger = Math.floor(Math.random() * staggerBase) + 2000
            await new Promise(r => setTimeout(r, stagger))
        }
    }
})

ipcMain.on('campaign:pause', () => manager?.pauseAll())
ipcMain.on('campaign:resume', () => manager?.resumeAll())
ipcMain.on('campaign:stop', () => manager?.stopAllCampaigns())
ipcMain.handle('campaign:status', (e, { campaignId }) => manager?.campaignManager?.getCampaignStatus(campaignId) || { status: 'UNKNOWN' })

ipcMain.handle('campaign:create', async (e, d) => campaignManager?.createCampaign(d.leads, d.mapping, d.variants))
ipcMain.handle('campaign:importLeads', async () => {
    if (!mainWindow) return []
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Leads File',
        filters: [{ name: 'Excel/CSV', extensions: ['xlsx', 'xls', 'csv'] }],
        properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return []
    try {
        return await campaignManager?.parseLeadsFile(filePaths[0])
    } catch (err) { return [] }
})

ipcMain.on('account:close', async (e, { number }) => {
    try {
        await manager?.closeAccount(number)
        mainWindow?.webContents.send('account:closed', { number })
    } catch (err) { }
})

// -- License IPCs (Secure Logic Restoration) --
ipcMain.handle('license:status', () => licenseManager?.getStatus())
ipcMain.handle('license:validate', async (e, key) => {
    const res = await licenseManager?.validate(key)
    return res
})
ipcMain.handle('license:startTrial', async () => await licenseManager?.startFreeTrial())

// -- Warmer & Survivability (Hybrid Integration) --
ipcMain.handle('survivability:stats', async () => await manager?.getSurvivabilityStats())
ipcMain.handle('warmer:get-state', async () => warmerManager?.getDashboardState())
ipcMain.on('warmer:toggle', (e, { enabled }) => {
    if (enabled) {
        try {
            licenseManager.ensureValidLicense()
            warmerManager?.start()
        } catch (err) {
            mainWindow?.webContents.send('license:lock', { reason: 'License required for Number Warmer.' })
            return
        }
    } else {
        warmerManager?.stop()
    }
    const state = warmerManager?.getDashboardState()
    if (state) mainWindow?.webContents.send('warmer:update', state)
})

// =========================================================
// 2. INITIALIZATION FLOW
// =========================================================

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400, height: 900,
        backgroundColor: '#0f172a',
        webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true }
    })
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    mainWindow.on('closed', () => mainWindow = null)
}

app.whenReady().then(async () => {
    ensureConfig()
    const dataDir = path.join(app.getPath('userData'), 'whatsapp-data')

    // 1. License System (Security Priority)
    licenseManager = new LicenseManager(userDataPath)

    registry = new AccountRegistry({
        accountsDir: path.join(dataDir, 'sessions'),
        logsDir: path.join(dataDir, 'logs')
    })
    campaignManager = new CampaignManager({ registry, logsDir: path.join(dataDir, 'logs') })
    manager = new ExtractionManager({ registry, campaignManager, licenseManager })

    // 2. Initialize Warmer (1.0.11 Biological Engine)
    warmerManager = new WarmerManager(
        manager,
        path.join(userDataPath, 'warmer-state'),
        licenseManager
    )

    // Forward Events
    manager.on('highway:command', (d) => mainWindow?.webContents.send('highway:command', d))
    manager.on('highway:turbo', (d) => mainWindow?.webContents.send('highway:turbo', d))
    manager.on('highway:discovery', (d) => mainWindow?.webContents.send('highway:discovery', d))
    manager.on('highway:pulse', (d) => mainWindow?.webContents.send('highway:pulse', d))
    manager.on('highway:system', (d) => mainWindow?.webContents.send('highway:system', d))
    manager.on('campaign:status', (d) => mainWindow?.webContents.send('campaign:status:update', d))
    campaignManager.on('queue:progress', (d) => mainWindow?.webContents.send('campaign:progress', d))
    campaignManager.on('campaign:state', (d) => mainWindow?.webContents.send('campaign:state:updated', d))
    manager.on('health:alert', (d) => mainWindow?.webContents.send('health:alert', d))

    // Warmer Update forwarding
    warmerManager.on('update', (state) => {
        mainWindow?.webContents.send('warmer:update', state)
    })

    createWindow()

    // Heartbeat
    setInterval(async () => {
        const result = await licenseManager.silentValidate();
        if (!result.success && result.reason !== 'No license key stored.') {
            manager?.closeAll();
            warmerManager?.stop();
            mainWindow?.webContents.send('license:lock', { reason: result.reason });
        }
    }, 60 * 1000);

    // Auto-Start
    const licStatus = licenseManager.getStatus();
    if (licStatus.isValid) {
        const accounts = registry.listAccounts()
        for (const acc of accounts) {
            manager.startAccount(acc.number)
            await new Promise(r => setTimeout(r, 500))
        }
    }
})

app.on('window-all-closed', async () => {
    if (manager) await manager.closeAll()
    if (warmerManager) warmerManager.stop()
    if (process.platform !== 'darwin') app.quit()
})
