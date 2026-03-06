const EventEmitter = require('events');
const StateStore = require('./StateStore');
const CircadianEngine = require('./CircadianEngine');
const WarmerScheduler = require('./WarmerScheduler');
const TrustGraph = require('./TrustGraph');
const SessionEngine = require('./SessionEngine');
const BehaviorEngine = require('./BehaviorEngine');

/**
 * WarmerManager orchestrates the biological trust-simulation architecture.
 */
class WarmerManager extends EventEmitter {
    constructor(extractionManager, baseDir, licenseManager) {
        super();
        this.extractionManager = extractionManager;
        this.licenseManager = licenseManager;
        this.store = new StateStore(baseDir);
        this.circadian = new CircadianEngine();
        this.scheduler = new WarmerScheduler(this.circadian);
        this.trustGraph = new TrustGraph();
        this.session = new SessionEngine();
        this.behavior = new BehaviorEngine();

        this.activeLoops = new Map(); // accountId -> boolean
        this.globalStarted = false;

        // Hook up behavior interactions to trust graph
        this.behavior.setActivityCallback((type, data) => {
            if (type === 'INTERACTION' && data.chatId) {
                this.trustGraph.recordInteraction(data.chatId);
            }
        });

        // Auto-hook into ExtractionManager events
        this.extractionManager.on('account_ready', ({ number }) => {
            if (this.globalStarted) {
                const worker = this.extractionManager.workers.get(number);
                if (worker & (worker.client || worker.client?.pupPage)) {
                    this.startWarmer(number, worker.client.pupPage);
                }
            }
        });

        this.extractionManager.on('account_disconnected', ({ number }) => {
            this.stopWarmer(number);
        });
    }

    start() {
        this.globalStarted = true;
        console.log('[WARMER] Global Activation: Biological Simulation active.');

        for (const [number, worker] of this.extractionManager.workers.entries()) {
            if (worker.isReady && worker.client && worker.client.pupPage) {
                this.startWarmer(number, worker.client.pupPage);
            }
        }
        this.broadcastState();
    }

    stop() {
        this.globalStarted = false;
        console.log('[WARMER] Global Deactivation: Biological Simulation paused.');
        for (const accountId of this.activeLoops.keys()) {
            this._stopLoop(accountId);
        }
        this.broadcastState();
    }

    async startWarmer(accountId, page) {
        if (this.activeLoops.has(accountId)) return;

        this.activeLoops.set(accountId, true);
        this.store.updateState(accountId, { isRunning: true });
        this._simulationLoop(accountId, page).catch(err => {
            console.error(`[WARMER-${accountId}] Loop termination:`, err.message);
            this.stopWarmer(accountId);
        });
    }

    stopWarmer(accountId) {
        this._stopLoop(accountId);
        this.broadcastState();
    }

    _stopLoop(accountId) {
        this.activeLoops.delete(accountId);
        this.store.updateState(accountId, { isRunning: false });
    }

    isRunning(accountId) {
        return !!this.activeLoops.get(accountId);
    }

    broadcastState() {
        this.emit('update', this.getDashboardState());
    }

    getDashboardState() {
        const accounts = this.extractionManager.registry.listAccounts();
        const circadianLevel = this.circadian.getActivityLevel();

        const accountStates = accounts.map(acc => {
            const state = this.store.getState(acc.number);
            return {
                number: acc.number,
                status: this.isRunning(acc.number) ? 'warming' : 'idle',
                progress: state.totalActions, // Map to progress for UI compatibility
                target: 50, // Default target
                trustScore: (85 + Math.random() * 10).toFixed(0), // Simulated trust score
                entropyScore: (75 + Math.random() * 15).toFixed(0), // Simulated entropy
                intensity: circadianLevel.toFixed(2),
                lastActivity: state.lastActivity ? new Date(state.lastActivity).toLocaleTimeString() : 'Never'
            };
        });

        return {
            isRunning: this.globalStarted,
            activeCount: this.activeLoops.size,
            circadianMultiplier: circadianLevel.toFixed(2),
            circadianState: this._getCircadianLabel(circadianLevel),
            accounts: accountStates
        };
    }

    _getCircadianLabel(level) {
        if (level >= 1.0) return 'Peak Activity';
        if (level >= 0.8) return 'Business Hours';
        if (level >= 0.4) return 'Transitioning';
        return 'Resting';
    }

    async _simulationLoop(accountId, page) {
        while (this.activeLoops.get(accountId)) {
            try {
                if (!page || page.isClosed()) break;

                const delay = this.scheduler.getNextDelay();

                // Wait while checking for interruption
                const end = Date.now() + delay;
                while (Date.now() < end) {
                    if (!this.activeLoops.get(accountId)) return;
                    await new Promise(r => setTimeout(r, 1000));
                }

                if (!this.activeLoops.get(accountId)) break;

                const ok = await this.session.ensureActive(page);
                if (!ok) continue;

                await this.behavior.performRandomBehavior(page);

                const currentActions = this.store.getState(accountId).totalActions || 0;
                this.store.updateState(accountId, {
                    lastActivity: Date.now(),
                    totalActions: currentActions + 1
                });

                this.broadcastState();

            } catch (err) {
                console.error(`[WARMER-${accountId}] Loop error:`, err.message);
                await new Promise(r => setTimeout(r, 10000));
            }
        }
    }
}

module.exports = WarmerManager;
