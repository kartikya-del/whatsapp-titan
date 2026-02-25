const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

const StateStore = require('./StateStore');
const TrustGraph = require('./TrustGraph');
const CircadianEngine = require('./CircadianEngine');
const SessionEngine = require('./SessionEngine');
const WarmerScheduler = require('./WarmerScheduler');

/**
 * WarmerManager orchestrates the account warming system.
 * It coordinates behavior simulation, circadian variation, and trust-building tasks.
 */
class WarmerManager extends EventEmitter {
    constructor(extractionManager, baseDir, licenseManager) {
        super();
        this.baseDir = baseDir || path.join(process.cwd(), 'userData', 'warmer');
        this.extractionManager = extractionManager;
        this.licenseManager = licenseManager;

        // Core Engines
        this.store = new StateStore(this.baseDir);
        this.trustGraph = new TrustGraph(this.store);
        this.circadian = new CircadianEngine();

        this.activityLog = [];
        this.maxLogSize = 50;

        // Callback for activity updates
        const onActivity = (type, message, metadata) => {
            this.logEvent(type, message);

            // Sync with health tracking
            if (type === 'interaction' && message.includes('complete')) {
                if (metadata && metadata.contact) {
                    this._updateHealthMetrics(metadata.account, 'interaction', { target: metadata.contact });
                }
            }

            if (type === 'session_start') {
                const match = message.match(/for (\d+)/);
                if (match) this._updateHealthMetrics(match[1], 'session_start');
            }

            if (type === 'session_end') {
                if (metadata && metadata.duration) {
                    this._updateHealthMetrics(metadata.account, 'presence', { duration: metadata.duration });
                }
            }
        };

        this.session = new SessionEngine(this.baseDir, this.extractionManager, this.store, onActivity);
        this.scheduler = new WarmerScheduler(this.store, this.circadian);

        this.activeSessions = new Set();
        this.isRunning = false;

        // Listen for browser ready events if needed
        this.extractionManager.on('account_ready', () => this._startNextSession());

        this._loadMetrics();

        // Background maintenance loop
        setInterval(() => {
            if (this.isRunning) this._checkSchedule();
        }, 2000);
    }

    /**
     * Records an internal activity log.
     */
    logEvent(type, message) {
        const entry = {
            id: Date.now() + Math.random(),
            timestamp: new Date().toLocaleTimeString(),
            type,
            message
        };

        this.activityLog.unshift(entry);
        if (this.activityLog.length > this.maxLogSize) {
            this.activityLog.pop();
        }

        // Auto-broadcast important updates
        if (type === 'session_end' || type === 'error' || type === 'status') {
            this.broadcastState();
        }
    }

    /**
     * Starts the warming engine.
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.scheduler.start();
        this.logEvent('info', 'Titan Warmer Engaged: Human-Mimetic Behavior & Circadian Cycle Active.');
        this.broadcastState();

        // Initial kick-off
        setTimeout(() => this._startNextSession(), 2000);
    }

    /**
     * Stops the warming engine.
     */
    stop() {
        this.isRunning = false;
        this.scheduler.stop();
        this.logEvent('status', 'Warmer paused by user.');
        this.broadcastState();
    }

    /**
     * Returns the full state for UI dashboard.
     */
    getDashboardState() {
        const today = new Date().toISOString().split('T')[0];
        const todayStats = this.store.getDailyStats()[today] || {};
        const accountsList = this.extractionManager.registry.getAccounts();

        const accountStates = accountsList.map(acc => {
            return {
                number: acc.number,
                target: this._getDailyTarget(acc.number),
                progress: todayStats[acc.number] || 0,
                status: this.session.activeSessions.has(acc.number) ? 'warming' : 'idle',
                trustScore: this.trustGraph.getTrustScore(acc.number),
                entropyScore: (70 + Math.random() * 20).toFixed(0), // Simulated variety score
                nextSessionIn: '15-45 minutes'
            };
        });

        return {
            isRunning: this.isRunning,
            activeCount: this.session.activeSessions.size,
            circadianMultiplier: this.circadian.getCurrentMultiplier().toFixed(2),
            circadianState: this._getCircadianLabel(),
            accounts: accountStates,
            recentActivity: this.activityLog
        };
    }

    /**
     * Translates circadian multiplier to a human label.
     */
    _getCircadianLabel() {
        const m = this.circadian.getCurrentMultiplier();
        if (m >= 1.0) return 'Peak Activity';
        if (m > 0.6) return 'Normal Activity';
        if (m > 0.0) return 'Low Activity';
        return 'Resting';
    }

    /**
     * Emits state update to listeners (usually main IPC).
     */
    broadcastState() {
        this.emit('update', this.getDashboardState());
    }

    /**
     * Decides whether to start a new warming session for a candidate account.
     */
    async _startNextSession() {
        if (!this.isRunning) return;

        // Check license limits if applicable
        if (this.licenseManager) {
            const { allowed } = await this.licenseManager.checkTrialLimit('warmer');
            if (!allowed) {
                this.logEvent('error', 'Warmer session blocked: Daily limit reached for current license.');
                return;
            }
        }

        const activeCount = this.session.activeSessions.size;
        if (activeCount >= 3) return; // Concurrency limit

        const candidates = this._getEligibleAccounts();
        if (candidates.length === 0) return;

        // Pick a random candidate
        const winner = candidates[Math.floor(Math.random() * candidates.length)];

        this.session.startSession(winner).catch(err => {
            this.logEvent('error', `Failed to start session for ${winner}: ${err.message}`);
        });
    }

    /**
     * Returns list of account numbers that haven't hit their daily target yet.
     */
    _getEligibleAccounts() {
        const today = new Date().toISOString().split('T')[0];
        const dailyStats = this.store.getDailyStats()[today] || {};
        const allAccounts = this.extractionManager.registry.getAccounts();

        return allAccounts.map(a => a.number).filter(num => {
            if (this.session.activeSessions.has(num)) return false;

            const target = this._getDailyTarget(num);
            const done = dailyStats[num] || 0;

            return done < target;
        });
    }

    /**
     * Dynamic daily target calculation (mimetic growth).
     */
    _getDailyTarget(number) {
        const today = new Date().toISOString().split('T')[0];
        if (!this.dailyTargets) this.dailyTargets = {};
        if (!this.dailyTargets[today]) this.dailyTargets[today] = {};

        if (!this.dailyTargets[today][number]) {
            const min = 15;
            const max = 40;
            this.dailyTargets[today][number] = Math.floor(Math.random() * (max - min + 1)) + min;
        }

        return this.dailyTargets[today][number];
    }

    /**
     * Updates long-term health metrics for an account.
     */
    _updateHealthMetrics(number, type, data) {
        const today = new Date().toISOString().split('T')[0];
        if (!this.healthMetrics) this.healthMetrics = {};
        if (!this.healthMetrics[today]) this.healthMetrics[today] = {};
        if (!this.healthMetrics[today][number]) {
            this.healthMetrics[today][number] = {
                interactions: 0,
                sessions: 0,
                contacts: [],
                timestamps: [],
                presenceMs: 0
            };
        }

        const stats = this.healthMetrics[today][number];
        if (type === 'interaction') {
            stats.interactions++;
            if (!stats.contacts.includes(data.target)) stats.contacts.push(data.target);
            stats.timestamps.push(Date.now());
        } else if (type === 'session_start') {
            stats.sessions++;
        } else if (type === 'presence') {
            stats.presenceMs += data.duration;
        }

        this._saveMetrics();
    }

    /**
     * Calculates an "Account Health" or "Ban Resistance" score (0-100).
     */
    calculateHealthScore(number) {
        let interactionCount = 0;
        let sessionCount = 0;
        let uniqueContacts = new Set();
        let allTimestamps = [];
        let presenceMs = 0;
        let activeDays = 0;

        const now = new Date();
        // Look back 30 days
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(now.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            if (this.healthMetrics?.[dateStr]?.[number]) {
                const dayData = this.healthMetrics[dateStr][number];
                interactionCount += dayData.interactions || 0;
                sessionCount += dayData.sessions || 0;
                presenceMs += dayData.presenceMs || 0;

                if (Array.isArray(dayData.contacts)) {
                    dayData.contacts.forEach(c => uniqueContacts.add(c));
                }

                if (Array.isArray(dayData.timestamps)) {
                    dayData.timestamps.forEach(t => allTimestamps.push(t));
                }

                if (dayData.interactions > 0 || dayData.presenceMs > 60000) activeDays++;
            }
        }

        // Sub-scores
        const volumeScore = Math.min(100, interactionCount); // 0-100 interactions
        const consistencyScore = activeDays > 0 ? (sessionCount / activeDays) : 0;
        const normalizedConsistency = Math.min(100, (consistencyScore / 3) * 100);
        const varietyScore = Math.min(100, (uniqueContacts.size / 20) * 100);

        // Entropy (Regularity of Timing)
        let entropyScore = 50;
        if (allTimestamps.length > 5) {
            const sorted = [...allTimestamps].sort((a, b) => a - b);
            const gaps = [];
            for (let i = 1; i < sorted.length; i++) {
                const gap = sorted[i] - sorted[i - 1];
                if (gap < 2700000) gaps.push(gap); // Only look at same-day sessions
            }

            if (gaps.length >= 2) {
                const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
                const variance = gaps.reduce((a, b) => a + Math.pow(b - avgGap, 2), 0) / gaps.length;
                const stdDev = Math.sqrt(variance);

                // Higher standard deviation means more random (human) behavior
                entropyScore = Math.min(100, (stdDev / 30000) * 100);
                if (entropyScore < 20) entropyScore = 20; // Cap low end
            }
        }

        const presenceRatio = activeDays > 0 ? (presenceMs / activeDays) : 0;
        const presenceScore = Math.min(100, (presenceRatio / 1200000) * 100); // 20m/day = 100

        // Final weighted score
        const final = (volumeScore * 0.4) + (normalizedConsistency * 0.2) + (varietyScore * 0.15) + (entropyScore * 0.15) + (presenceScore * 0.1);

        return Math.floor(final);
    }

    _loadMetrics() {
        try {
            const filePath = path.join(this.baseDir, 'health_metrics.json');
            if (fs.existsSync(filePath)) {
                this.healthMetrics = JSON.parse(fs.readFileSync(filePath));
            }
        } catch (err) { }
    }

    _saveMetrics() {
        try {
            fs.writeFileSync(
                path.join(this.baseDir, 'health_metrics.json'),
                JSON.stringify(this.healthMetrics, null, 2)
            );
        } catch (err) { }
    }

    _checkSchedule() {
        // Internal tick for scheduler logic
    }
}

module.exports = WarmerManager;