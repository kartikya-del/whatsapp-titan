const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// Core Engines
const ExtractionManager = require('../engine/ExtractionManager');
const AccountRegistry = require('../engine/AccountRegistry');
const CampaignManager = require('../engine/CampaignManager');
const WarmerManager = require('../engine/warmer/WarmerManager');
const LicenseManager = require('../engine/LicenseManager');

/**
 * Main Process for LeadTitan Desktop.
 * It initializes all core engines and manages IPC communication between renderer and back-end logic.
 */

let mainWindow;
let manager = null;
let registry = null;
let campaignManager = null;
let warmerManager = null;
let licenseManager = null;

const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'titan-config.json');

// --- Initialization ---

async function initializeApp() {
    ensureConfigFile();

    const dataDir = path.join(userDataPath, 'whatsapp-data');

    // 1. Initialize License System (Priority 1)
    licenseManager = new LicenseManager(userDataPath);

    // 2. Initialize Registry & Campaign Managers
    registry = new AccountRegistry({
        accountsDir: path.join(dataDir, 'sessions'),
        logsDir: path.join(dataDir, 'logs')
    });

    campaignManager = new CampaignManager({
        registry,
        logsDir: path.join(dataDir, 'logs')
    });

    // 3. Initialize Extraction Manager (The Hub)
    manager = new ExtractionManager({
        registry,
        campaignManager,
        licenseManager
    });

    // 4. Initialize Warmer (The Anti-Ban system)
    warmerManager = new WarmerManager(
        manager,
        path.join(userDataPath, 'warmer-state'),
        licenseManager
    );

    setupIpcHandlers();
    forwardEngineEvents();

    createWindow();

    // 5. Post-Boot: Auto-start accounts if licensed
    const licStatus = licenseManager.getStatus();
    if (licStatus.isValid) {
        const accounts = registry.getAccounts();
        console.log(`[MAIN] Boot: Starting ${accounts.length} registered accounts...`);
        for (const acc of accounts) {
            manager.startAccount(acc.number);
            await sleep(500);
        }
    }

    // 6. License Heartbeat (Anti-Piracy/Expiry Check)
    setInterval(async () => {
        const result = await licenseManager.silentValidate();
        if (!result.success && result.reason !== 'No license key stored.') {
            console.warn('[MAIN] Security Heartbeat failed. Locking application.');
            manager?.closeAll();
            warmerManager?.stop();
            mainWindow?.webContents.send('license:lock', { reason: result.reason });
        }
    }, 60 * 1000);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        backgroundColor: '#0f172a', // Slate-900
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Production Hardening
    if (app.isPackaged) {
        mainWindow.removeMenu();
        mainWindow.webContents.on('devtools-opened', () => {
            mainWindow.webContents.closeDevTools();
        });
    }
}

// --- IPC Handlers ---

function setupIpcHandlers() {
    // Configuration
    ipcMain.handle('config:get', () => {
        if (!fs.existsSync(configPath)) return {};
        try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { return {}; }
    });

    ipcMain.on('config:save', (event, data) => {
        try {
            const current = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
            const updated = { ...current, ...data };
            fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
        } catch (e) { console.error('[MAIN] Config Save Error:', e); }
    });

    // Accounts
    ipcMain.handle('accounts:list', async () => {
        if (!registry) return [];
        const list = registry.getAccounts();
        return list.map(acc => {
            const worker = manager?.workers.get(acc.number);
            let liveState = 'disconnected';
            if (worker) {
                const isBrowserAlive = worker.client?.pupBrowser?.isConnected();
                if (worker.isReady && isBrowserAlive) liveState = 'ready';
                else if (isBrowserAlive) liveState = 'initializing';
            }
            return { ...acc, liveState };
        });
    });

    ipcMain.on('account:add:start', async (event, { number }) => {
        try {
            licenseManager.ensureValidLicense();
            if (registry.getAccounts().length >= 10) {
                return mainWindow?.webContents.send('account:error', { number, error: 'Maximum 10 accounts reached.' });
            }
            registry.createSession(number);
            await manager.startAccount(number);
        } catch (err) {
            mainWindow?.webContents.send('account:error', { number, error: err.message });
        }
    });

    ipcMain.on('account:remove', async (event, { number }) => {
        try {
            await manager.closeAccount(number);
            registry.removeAccount(number);
            mainWindow?.webContents.send('account:removed', { number });
        } catch (err) { console.error('[MAIN] Removal Error:', err); }
    });

    // Extraction & Discovery
    ipcMain.on('account:groups:list', (e, { number }) => {
        try {
            licenseManager.ensureValidLicense();
            manager?.getGroups(number);
        } catch (err) {
            mainWindow?.webContents.send('license:lock', { reason: 'License required for Group Grabber.' });
        }
    });

    ipcMain.on('account:extract:start', async (e, { number, groupIds }) => {
        try {
            licenseManager.ensureValidLicense();
            const result = await manager?.extractGroups(number, groupIds);
            mainWindow?.webContents.send('extraction:complete', { number, contacts: result });
        } catch (err) {
            mainWindow?.webContents.send('account:error', { number, error: err.message });
        }
    });

    // Campaigns
    ipcMain.on('campaign:start', async (e, data) => {
        try {
            licenseManager.ensureValidLicense();
            const staggerBase = 10000;
            for (const m of data.mapping) {
                manager?.runCampaignForNumber(m.number, data.campaignId, { ...data.options, ...m });
                if (data.mapping.length > 1) {
                    await sleep(Math.floor(Math.random() * staggerBase) + 2000);
                }
            }
        } catch (err) {
            mainWindow?.webContents.send('license:lock', { reason: 'License required for Campaigns.' });
        }
    });

    // Warmer
    ipcMain.handle('warmer:get-state', () => warmerManager?.getDashboardState() || {});
    ipcMain.on('warmer:toggle', (e, { enabled }) => {
        if (enabled) {
            try {
                licenseManager.ensureValidLicense();
                warmerManager?.start();
            } catch (err) {
                mainWindow?.webContents.send('license:lock', { reason: 'License required for Number Warmer.' });
                return;
            }
        } else {
            warmerManager?.stop();
        }
        const state = warmerManager?.getDashboardState();
        if (state) mainWindow?.webContents.send('warmer:update', state);
    });

    // License Management
    ipcMain.handle('license:validate', (e, key) => licenseManager.validate(key));
    ipcMain.handle('license:status', () => licenseManager.getStatus());
    ipcMain.handle('license:trial', () => licenseManager.startFreeTrial());
    ipcMain.handle('license:usage', () => licenseManager.getUsage());
    ipcMain.handle('license:expiry', () => licenseManager.getExpiryInfo());
    ipcMain.handle('license:reset', () => {
        licenseManager.resetLicenseCache();
        return { success: true };
    });

    // Trial Enforcement
    ipcMain.handle('trial:check-limit', async (e, type) => {
        return licenseManager.checkLimit(type);
    });
    ipcMain.handle('trial:consume', async (e, type, amount) => {
        await licenseManager.incrementUsage(type, amount);
    });

    // Account Operations
    ipcMain.handle('account:data', (e, number) => {
        return registry.getAccount(number);
    });
    ipcMain.handle('accounts:reconnect', async () => {
        const accounts = registry.getAccounts();
        for (const acc of accounts) {
            manager.startAccount(acc.number);
            await sleep(500);
        }
        return { success: true };
    });
    ipcMain.on('account:close', async (e, { number }) => {
        await manager.closeAccount(number);
    });
    ipcMain.on('account:cache:clear', async (e, { number }) => {
        await manager.closeAccount(number);
        registry.clearExtractionState(number);
    });

    // Global Controls
    ipcMain.handle('account:survivability:stats', async () => {
        return manager.getSurvivabilityStats();
    });
    ipcMain.on('account:emergency:stop', async () => {
        await manager.closeAll();
    });
    ipcMain.on('account:stealth:toggle', (e, { enabled }) => {
        manager.setStealthMode(enabled);
    });

    // System Utilities
    ipcMain.handle('system:factory-reset', async () => {
        try {
            warmerManager?.stop();
            await manager?.closeAll();
            await sleep(3000); // Wait for file handles to release

            const pathsToCleans = [
                path.join(userDataPath, 'titan-license.json'),
                path.join(userDataPath, 'titan-config.json'),
                path.join(userDataPath, 'warmer-state'),
                path.join(userDataPath, 'whatsapp-data')
            ];

            pathsToCleans.forEach(p => {
                if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
            });

            licenseManager.resetLicenseCache();
            return { success: true };
        } catch (err) {
            return { success: false, reason: err.message };
        }
    });
}

/**
 * Forwards internal engine events to the renderer via IPC.
 */
function forwardEngineEvents() {
    if (!manager) return;

    const events = [
        'qr', 'account_ready', 'account_disconnected', 'error',
        'discovery:progress', 'discovery:complete', 'metadata:progress',
        'extraction_start', 'extraction_progress', 'campaign:status'
    ];

    events.forEach(eventName => {
        manager.on(eventName, (data) => {
            mainWindow?.webContents.send(`account:${eventName.replace(':', '-')}`, data);
        });
    });

    // Special mappings
    campaignManager.on('queue:progress', (data) => mainWindow?.webContents.send('campaign:progress', data));
    campaignManager.on('campaign:state', (data) => mainWindow?.webContents.send('campaign:state:updated', data));

    // Warmer updates
    warmerManager.on('update', (state) => {
        mainWindow?.webContents.send('warmer:update', state);
    });
}

function ensureConfigFile() {
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({
            variants: ["Hello! Hope you're doing well."],
            autoReplyRules: []
        }, null, 2));
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Lifecycle ---

app.disableHardwareAcceleration(); // Performance/Stability for multiple browsers

app.whenReady().then(initializeApp);

app.on('window-all-closed', async () => {
    warmerManager?.stop();
    await manager?.closeAll();
    if (process.platform !== 'darwin') app.quit();
});
