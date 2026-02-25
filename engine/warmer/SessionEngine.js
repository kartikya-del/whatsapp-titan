const BehaviorEngine = require('./BehaviorEngine');

/**
 * SessionEngine manages a dedicated browser session for account warming.
 * It simulates a single "session" of usage, performing multiple actions
 * like messaging, status viewing, and scrolling.
 */
class SessionEngine {
    constructor(baseDir, extractionManager, trustGraph, onLog) {
        this.baseDir = baseDir;
        this.manager = extractionManager;
        this.graph = trustGraph;
        this.behavior = new BehaviorEngine();
        this.activeSessions = new Map();
        this.log = onLog || (() => { });
    }

    /**
     * Starts a warming session for a specific account.
     */
    async startSession(number) {
        if (this.activeSessions.has(number)) {
            this.log('warn', `Session already active for ${number}. Skipping.`);
            return;
        }

        this.log('session_start', `Initializing warming session for ${number}`);
        this.activeSessions.set(number, { startTime: Date.now() });

        let browserMetadata = null;
        try {
            // 1. Launch Browser
            const { browser, page } = await this.manager.launchBrowser(number);
            browserMetadata = { browser, page };

            // 2. Decide session duration (15 to 45 minutes)
            const minMinutes = 15;
            const maxMinutes = 45;
            const durationMs = (Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes) * 60 * 1000;
            const endTime = Date.now() + durationMs;

            this.log('info', `Session planned for ~${(durationMs / 60000).toFixed(1)} minutes.`);

            // 3. Main Loop
            while (Date.now() < endTime) {
                // Perform a cluster of activities
                const clusterSize = Math.floor(Math.random() * 5) + 2; // 2-6 activities per cluster
                this.log('info', `Starting activity cluster (${clusterSize} actions)...`);

                for (let i = 0; i < clusterSize; i++) {
                    if (Date.now() >= endTime) break;

                    const allAccounts = this.manager.registry.getAccounts().map(a => a.number);
                    const strategy = this.graph.pickWarmingTarget(number, allAccounts);

                    if (strategy.type === 'COOPERATIVE' || strategy.type === 'EXPLORATORY' || strategy.type === 'MAINTENANCE') {
                        // Messaging behavior
                        if (strategy.target) {
                            this.log('action', `Initiating interaction with peer: ${strategy.target}`);

                            await this.behavior.performSequence(page, strategy.target, (type, detail) => {
                                this.log(type, detail, { account: number, target: strategy.target });
                            });

                            this.graph.recordInteraction(number, strategy.target);
                            this._incrementDailyCount(number);
                        }
                    } else {
                        // Passive behavior (presence simulation)
                        await this.behavior.performPassive(page, (type, detail) => {
                            this.log(type, detail);
                        });
                    }

                    // Inter-action delay (10-30 seconds)
                    await this._sleep(Math.floor(Math.random() * 20000) + 10000);
                }

                // Inter-cluster "AFK" time (1-5 minutes)
                this.log('info', 'Cluster complete. Simulating idle presence...');
                await this._sleep(Math.floor(Math.random() * 240000) + 60000);
            }

        } catch (err) {
            this.log('error', `Session failed for ${number}: ${err.message}`);
        } finally {
            // 4. Cleanup
            const duration = Date.now() - (this.activeSessions.get(number)?.startTime || Date.now());
            this.log('session_end', `Session concluded for ${number}`, { account: number, duration });

            if (browserMetadata) {
                await this.manager.closeBrowser(number).catch(() => { });
            }

            this.activeSessions.delete(number);
        }
    }

    /**
     * Increments the daily activity counter in the store.
     */
    _incrementDailyCount(number) {
        const stats = this.manager.store.getDailyStats();
        const today = new Date().toISOString().split('T')[0];

        if (!stats[today]) stats[today] = {};
        if (!stats[today][number]) stats[today][number] = 0;

        stats[today][number]++;
        this.manager.store.saveDailyStats(stats);
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = SessionEngine;