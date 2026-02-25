const fs = require('fs');
const path = require('path');

/**
 * StateStore manages the persistence of warmer-related data.
 * It handles behavior profiles, trust graphs, and operational metrics.
 */
class StateStore {
    constructor(baseDir) {
        this.baseDir = baseDir;
        this.behaviorDir = path.join(this.baseDir, 'behavior');
        this.operationalDir = path.join(this.baseDir, 'operational');

        // Ensure directories exist
        if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
        if (!fs.existsSync(this.behaviorDir)) fs.mkdirSync(this.behaviorDir, { recursive: true });
        if (!fs.existsSync(this.operationalDir)) fs.mkdirSync(this.operationalDir, { recursive: true });

        // Caching
        this.behaviorCache = {};
        this.operationalCache = {};
    }

    /**
     * Loads a behavior profile for a specific account.
     */
    getBehaviorProfile(id, defaultVal = {}) {
        if (this.behaviorCache[id]) return this.behaviorCache[id];

        const filePath = path.join(this.behaviorDir, `${id}.json`);
        if (fs.existsSync(filePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                this.behaviorCache[id] = data;
                return data;
            } catch (err) {
                console.error(`[STATE-STORE] Failed to load behavior profile for ${id}:`, err.message);
            }
        }
        return defaultVal;
    }

    /**
     * Saves a behavior profile to disk.
     */
    saveBehaviorProfile(id, data) {
        this.behaviorCache[id] = data;
        const filePath = path.join(this.behaviorDir, `${id}.json`);
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error(`[STATE-STORE] Failed to save behavior profile for ${id}:`, err.message);
        }
    }

    /**
     * Generic loader for operational data (counts, active sessions, etc.).
     */
    getOperational(id, defaultVal = {}) {
        if (this.operationalCache[id]) return this.operationalCache[id];

        const filePath = path.join(this.operationalDir, `${id}.json`);
        if (fs.existsSync(filePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                this.operationalCache[id] = data;
                return data;
            } catch (err) {
                console.error(`[STATE-STORE] Failed to load operational state [${id}]:`, err.message);
            }
        }
        return defaultVal;
    }

    /**
     * Generic saver for operational data.
     */
    saveOperational(id, data) {
        this.operationalCache[id] = data;
        const filePath = path.join(this.operationalDir, `${id}.json`);
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error(`[STATE-STORE] Failed to save operational state [${id}]:`, err.message);
        }
    }

    // ---------- SHORTHAND ACCESSORS ----------

    getTrustGraph() {
        return this.getOperational('trust_graph', { nodes: {}, edges: {} });
    }

    saveTrustGraph(data) {
        this.saveOperational('trust_graph', data);
    }

    getBehaviorProfiles() {
        return this.getBehaviorProfile('behavior_profiles', {});
    }

    saveBehaviorProfiles(data) {
        this.saveBehaviorProfile('behavior_profiles', data);
    }

    getDailyStats() {
        // 'counts' stores interactions per account per day
        return this.getOperational('daily_counts', {});
    }

    saveDailyStats(data) {
        this.saveOperational('daily_counts', data);
    }

    getActiveSessions() {
        return this.getOperational('active_sessions', {});
    }

    saveActiveSessions(data) {
        this.saveOperational('active_sessions', data);
    }
}

module.exports = StateStore;