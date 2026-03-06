const fs = require('fs');
const path = require('path');

/**
 * StateStore manages persistence of warmer states.
 */
class StateStore {
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.states = new Map();

        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }

        this._loadStates();
    }

    getState(accountId) {
        if (!this.states.has(accountId)) {
            this.states.set(accountId, {
                lastActivity: null,
                activityHistory: [],
                intensity: 1.0,
                isRunning: false,
                totalActions: 0
            });
        }
        return this.states.get(accountId);
    }

    updateState(accountId, data) {
        const current = this.getState(accountId);
        const updated = { ...current, ...data };
        this.states.set(accountId, updated);
        this._saveState(accountId, updated);
    }

    _loadStates() {
        try {
            const files = fs.readdirSync(this.baseDir);
            for (const file of files) {
                if (file.endsWith('.state.json')) {
                    const accountId = file.replace('.state.json', '');
                    const content = fs.readFileSync(path.join(this.baseDir, file), 'utf8');
                    this.states.set(accountId, JSON.parse(content));
                }
            }
        } catch (e) {
            console.error('[STATE-STORE] Load failed:', e.message);
        }
    }

    _saveState(accountId, state) {
        try {
            const filePath = path.join(this.baseDir, `${accountId}.state.json`);
            fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
        } catch (e) {
            console.error('[STATE-STORE] Save failed:', e.message);
        }
    }
}

module.exports = StateStore;
