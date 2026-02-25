const fs = require('fs');
const path = require('path');

/**
 * AccountRegistry manages the lifecycle, storage, and usage tracking of WhatsApp accounts.
 * It handles session directories, usage limits, and extraction state persistence.
 */
class AccountRegistry {
    constructor({ accountsDir, logsDir }) {
        this.accountsDir = accountsDir;
        this.logsDir = logsDir;
        this.accounts = new Map();

        this.usageFile = path.join(this.logsDir, 'daily_usage.json');
        this.globalFile = path.join(this.logsDir, 'global_history.json');

        // Ensure directories exist
        if (!fs.existsSync(this.accountsDir)) {
            fs.mkdirSync(this.accountsDir, { recursive: true });
        }
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }

        this.globalHistory = this._loadGlobalHistory();
        this._loadAccounts();
        this._loadUsage();
    }

    /**
     * Loads lifetime historical data for all accounts.
     */
    _loadGlobalHistory() {
        try {
            if (fs.existsSync(this.globalFile)) {
                return JSON.parse(fs.readFileSync(this.globalFile, 'utf8'));
            }
        } catch (err) {
            console.error('[REGISTRY] Failed to load global history:', err.message);
        }
        return {};
    }

    /**
     * Persists lifetime historical data to disk.
     */
    _saveGlobalHistory() {
        try {
            fs.writeFileSync(this.globalFile, JSON.stringify(this.globalHistory, null, 2));
        } catch (err) {
            console.error('[REGISTRY] Failed to save global history:', err.message);
        }
    }

    /**
     * Scans the accounts directory for existing session folders and restores the map.
     */
    _loadAccounts() {
        if (!fs.existsSync(this.accountsDir)) return;

        const files = fs.readdirSync(this.accountsDir);
        console.log('[REGISTRY] Scanning for existing accounts...');

        for (const folderName of files) {
            if (!folderName.startsWith('session-account_')) continue;

            const phoneNumber = folderName.replace('session-account_', '');
            console.log('[REGISTRY] Found account: ' + phoneNumber);

            this.accounts.set(phoneNumber, {
                number: phoneNumber,
                sessionPath: path.join(this.accountsDir, folderName),
                extracting: false,
                todayCount: 0,
                lifetimeCount: this.globalHistory[phoneNumber]?.total || 0,
                lastDate: this._today(),
                extractionState: null,
                cachedGroupCount: 0,
                cachedContactCount: 0
            });

            this._cleanupLockFiles(phoneNumber);
        }
        console.log(`[REGISTRY] Loaded ${this.accounts.size} account(s)`);
    }

    /**
     * Loads daily usage counts from disk and applies them to the current accounts.
     */
    _loadUsage() {
        if (!fs.existsSync(this.usageFile)) return;

        try {
            const usageData = JSON.parse(fs.readFileSync(this.usageFile, 'utf8'));
            const today = this._today();

            for (const number of Object.keys(usageData)) {
                const account = this.accounts.get(number);
                if (!account) continue;

                account.todayCount = usageData[number][today] || 0;
                account.lastDate = today;
            }
        } catch (err) {
            console.error('[REGISTRY] Failed to load usage data:', err.message);
        }
    }

    /**
     * Persists current daily usage tokens for all registered accounts.
     */
    _persistUsage() {
        const today = this._today();
        const usageData = {};

        for (const account of this.accounts.values()) {
            usageData[account.number] = {
                [today]: account.todayCount
            };
        }

        try {
            fs.writeFileSync(this.usageFile, JSON.stringify(usageData, null, 2));
        } catch (err) {
            console.error('[REGISTRY] Failed to persist usage:', err.message);
        }
    }

    /**
     * Utility: Returns current date in YYYY-MM-DD format.
     */
    _today() {
        return new Date().toISOString().slice(0, 10);
    }

    /**
     * Resets the daily token count if the date has changed since last usage.
     */
    _ensureDate(account) {
        const today = this._today();
        if (account.lastDate !== today) {
            account.todayCount = 0;
            account.lastDate = today;
        }
    }

    /**
     * Force-deletes Chromiums lock files to prevent "Profile in use" errors during restart.
     */
    _cleanupLockFiles(number) {
        const account = this.accounts.get(number);
        if (!account || !account.sessionPath) return;

        const possiblePaths = [
            path.join(account.sessionPath, 'Default', 'SingletonLock'),
            path.join(account.sessionPath, 'SingletonLock'),
            path.join(account.sessionPath, 'Default', 'lockfile'),
            path.join(account.sessionPath, 'lockfile')
        ];

        possiblePaths.forEach(lockPath => {
            if (fs.existsSync(lockPath)) {
                try {
                    fs.unlinkSync(lockPath);
                    console.log(`[REGISTRY] Cleaned lock file for ${number}: ${path.basename(lockPath)}`);
                } catch (err) {
                    // Ignore errors if file is actually locked by another process
                }
            }
        });
    }

    /**
     * Returns a summary list of all accounts for the UI.
     */
    getAccounts() {
        return Array.from(this.accounts.values()).map(acc => ({
            number: acc.number,
            extracting: acc.extracting,
            todayCount: acc.todayCount,
            lifetimeCount: acc.lifetimeCount || 0,
            groupCount: acc.cachedGroupCount || 0,
            contactCount: acc.cachedContactCount || 0
        }));
    }

    /**
     * Updates UI-visible counters for groups and contacts.
     */
    updateAccountCounts(number, groupCount, contactCount) {
        const account = this.getAccount(number);
        if (account) {
            account.cachedGroupCount = groupCount;
            account.cachedContactCount = contactCount;
        }
    }

    /**
     * Returns metadata for a specific account, ensuring daily limits are checked.
     */
    getAccount(number) {
        const account = this.accounts.get(number);
        if (!account) throw new Error('Account not found: ' + number);
        this._ensureDate(account);
        return account;
    }

    /**
     * Creates a new session directory and registers a new account.
     */
    createSession(number) {
        const sessionPath = path.join(this.accountsDir, 'session-account_' + number);

        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        const initialLifetime = this.globalHistory[number]?.total || 0;

        this.accounts.set(number, {
            number: number,
            sessionPath: sessionPath,
            extracting: false,
            todayCount: 0,
            lifetimeCount: initialLifetime,
            lastDate: this._today(),
            extractionState: null
        });

        if (!this.globalHistory[number]) {
            this.globalHistory[number] = {
                total: 0,
                firstSeen: new Date().toISOString()
            };
            this._saveGlobalHistory();
        }

        return sessionPath;
    }

    /**
     * Saves the current extraction progress (state) to the account's session folder.
     */
    updateExtractionState(number, state) {
        const account = this.getAccount(number);
        account.extractionState = state;

        const stateFile = path.join(account.sessionPath, 'extraction_state.json');
        try {
            fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
        } catch (err) {
            console.error(`[REGISTRY] Failed to save extraction state for ${number}:`, err.message);
        }
    }

    /**
     * Completely removes an account, its metadata, and its session folder.
     */
    removeAccount(number) {
        console.log('[REGISTRY] Deleting account: ' + number);
        const account = this.accounts.get(number);

        if (!account) return false;

        if (fs.existsSync(account.sessionPath)) {
            try {
                fs.rmSync(account.sessionPath, { recursive: true, force: true });
            } catch (err) {
                console.error(`[REGISTRY] Failed to delete session folder for ${number}:`, err);
            }
        }

        this.accounts.delete(number);
        this._persistUsage();
        return true;
    }

    /**
     * Loads the extraction state from disk if it exists.
     */
    getExtractionState(number) {
        const account = this.getAccount(number);
        const stateFile = path.join(account.sessionPath, 'extraction_state.json');

        if (fs.existsSync(stateFile)) {
            try {
                const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                account.extractionState = state;
                return state;
            } catch (err) {
                console.error(`[REGISTRY] Corruption in extraction_state for ${number}:`, err.message);
            }
        }
        return null;
    }

    /**
     * Clears the extraction state from memory and disk.
     */
    clearExtractionState(number) {
        const account = this.getAccount(number);
        account.extractionState = null;

        const stateFile = path.join(account.sessionPath, 'extraction_state.json');
        if (fs.existsSync(stateFile)) {
            try {
                fs.unlinkSync(stateFile);
            } catch (err) { }
        }
    }

    /**
     * Increments the usage count for an account and persists it.
     */
    incrementUsage(number, amount) {
        const account = this.getAccount(number);
        this._ensureDate(account);

        account.todayCount += amount;

        if (!account.lifetimeCount) account.lifetimeCount = 0;
        account.lifetimeCount += amount;

        // Sync to global history
        if (!this.globalHistory[number]) {
            this.globalHistory[number] = { total: 0, firstSeen: new Date().toISOString() };
        }
        this.globalHistory[number].total = account.lifetimeCount;
        this.globalHistory[number].lastActive = new Date().toISOString();

        this._saveGlobalHistory();
        this._persistUsage();
    }
}

module.exports = AccountRegistry;