const EventEmitter = require('events');
const StateStore = require('./StateStore');
const CircadianEngine = require('./CircadianEngine');
const WarmerScheduler = require('./WarmerScheduler');
const TrustGraph = require('./TrustGraph');
const SessionEngine = require('./SessionEngine');
const BehaviorEngine = require('./BehaviorEngine');
const PeerConversationEngine = require('./PeerConversationEngine');

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
        this.peerEngine = new PeerConversationEngine();

        this.activeLoops = new Map(); // accountId -> boolean
        this.pendingReplies = new Map(); // number -> { peer, thread, nextIdx }
        this.interrupts = new Map(); // number -> boolean (instant wake flag)
        this.recentActivity = []; // Array of { timestamp, message, type }
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
                if (worker && worker.isReady && worker.client && worker.client.pupPage) {
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
        console.log(`[WARMER-${accountId}] 🚀 Biological Sequence Activated. Monitoring health...`);
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

    _addActivity(message, type = 'action') {
        const activity = {
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            message,
            type
        };
        this.recentActivity.unshift(activity);
        if (this.recentActivity.length > 50) this.recentActivity.pop();
        this.broadcastState();
    }

    getDashboardState() {
        const accounts = this.extractionManager.registry.listAccounts();
        const circadianLevel = this.circadian.getActivityLevel();

        let connectedCount = 0;
        const accountStates = accounts.map(acc => {
            const state = this.store.getState(acc.number);
            const worker = this.extractionManager.workers.get(acc.number);
            const isConnected = !!(worker && worker.isReady && worker.client && worker.client.pupPage && !worker.client.pupPage.isClosed());
            if (isConnected) connectedCount++;
            return {
                number: acc.number,
                status: this.isRunning(acc.number) ? 'warming' : 'idle',
                connected: isConnected,
                progress: state.totalActions, // Map to progress for UI compatibility
                target: 100, // Updated daily warming goal
                trustScore: this.extractionManager.registry.getTrustScore(acc.number).toFixed(1),
                entropyScore: (75 + Math.random() * 15).toFixed(0), // Simulated entropy remains for now
                intensity: circadianLevel.toFixed(2),
                lastActivity: state.lastActivity ? new Date(state.lastActivity).toLocaleTimeString() : 'Never'
            };
        });

        return {
            isRunning: this.globalStarted,
            activeCount: this.activeLoops.size,
            connectedCount: connectedCount,
            circadianMultiplier: circadianLevel.toFixed(2),
            circadianState: this._getCircadianLabel(circadianLevel),
            accounts: accountStates,
            recentActivity: this.recentActivity
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

                const currentState = this.store.getState(accountId);
                if (currentState.totalActions >= 100) {
                    console.log(`[WARMER-${accountId}] ✅ Daily Warming Goal (100) Reached. Resting...`);
                    this.stopWarmer(accountId);
                    break;
                }

                // 0. Wait Period (Active or Biological)
                const delay = this.scheduler.getNextDelay();
                const end = Date.now() + delay;

                if (!this.interrupts.get(accountId)) {
                    console.log(`[WARMER-${accountId}] 💤 Path: [Biological Reset]. Resting for ${Math.round(delay / 1000 / 60 * 10) / 10} min...`);
                    this._addActivity(`[${accountId}] Resting for biological reset...`, 'info');
                    while (Date.now() < end) {
                        if (!this.activeLoops.get(accountId)) return;
                        if (this.interrupts.get(accountId)) {
                            console.log(`[WARMER-${accountId}] 🔔 Reactivity Interrupt: Peer is active. Picking up phone...`);
                            this._addActivity(`[${accountId}] 🔔 Notified! Awakening for peer...`, 'success');
                            break;
                        }
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
                this.interrupts.delete(accountId);

                if (!this.activeLoops.get(accountId)) break;

                const ok = await this.session.ensureActive(page);
                if (!ok) continue;

                console.log(`[WARMER-${accountId}] ⚡ Pulse Detected: Executing Human Sequence...`);
                this._addActivity(`[${accountId}] Pulse detected: starting sequence.`, 'success');

                // 1. Determine Narrative State
                const pending = this.pendingReplies.get(accountId);
                let activeThread = null;
                let activeText = null;
                let activePeer = null;
                let narrativeMode = 'PASSIVE';

                if (pending && pending.nextIdx < pending.thread.length) {
                    activeThread = pending.thread;
                    activeText = pending.thread[pending.nextIdx];
                    activePeer = pending.peer;
                    narrativeMode = 'P2P_REPLY';
                } else if (Math.random() > 0.4) { // 60% chance for fresh P2P
                    const peer = this.peerEngine.findAvailablePeer(accountId, this.activeLoops);
                    if (peer) {
                        activeThread = this.peerEngine.getRandomConversation();
                        activeText = activeThread[0];
                        activePeer = peer;
                        narrativeMode = 'P2P_START';
                    }
                }

                // 2. Execute Narrative Sequence
                try {
                    if (narrativeMode !== 'PASSIVE') {
                        const targetDisplayName = `+${activePeer}`;
                        console.log(`[WARMER-${accountId}] 🎭 [Step 1/4] Opening Peer Chat ${targetDisplayName}...`);
                        await this.behavior.openSpecificChat(page, `${activePeer}@c.us`);

                        // HUMAN READING TIME: Based on length of PREVIOUS message (if any)
                        if (narrativeMode === 'P2P_REPLY') {
                            const prevMsgs = activeThread[pending.nextIdx - 1];
                            const totalChars = Array.isArray(prevMsgs) ? prevMsgs.join('').length : prevMsgs.length;
                            const readingTime = Math.min(2000 + (totalChars * 150), 12000);
                            console.log(`[WARMER-${accountId}] 🎭 [Step 2/4] Reading message (${totalChars} chars)...`);
                            await new Promise(r => setTimeout(r, readingTime));
                        } else {
                            console.log(`[WARMER-${accountId}] 🎭 [Step 2/4] Scrolling Conversation History...`);
                            await this.behavior.scrollChat(page);
                        }

                        console.log(`[WARMER-${accountId}] 🎭 [Step 3/4] Drafting Peer Response...`);
                        this._addActivity(`[${accountId}] Drafting response to ${activePeer}...`, 'action');
                        const sent = await this.behavior.performPeerMessage(page, `${activePeer}@c.us`, activeText, accountId);

                        if (sent) {
                            console.log(`[WARMER-${accountId}] 🎭 [Step 4/4] Finalizing & Signaling Peer...`);
                            const currentIdx = (narrativeMode === 'P2P_REPLY') ? pending.nextIdx : 0;
                            const nextIdx = currentIdx + 1;

                            // --- HEALTH: Warming dialogue boosts trust ---
                            this.extractionManager.registry.addTrust(accountId, 0.5);

                            this.pendingReplies.delete(accountId);
                            if (nextIdx < activeThread.length) {
                                // Hand off to peer
                                this.pendingReplies.set(activePeer, {
                                    peer: accountId,
                                    thread: activeThread,
                                    nextIdx: nextIdx
                                });
                                // TRIGGER REACTIVITY IN PEER
                                if (Math.random() > 0.3) { // 70% chance for peer to wake up instantly
                                    this.interrupts.set(activePeer, true);
                                    this._addActivity(`[${accountId}] Sent burst, pinging ${activePeer}.`, 'success');
                                }
                            } else {
                                console.log(`[WARMER-${accountId}] ✅ Real-World Dialogue Finished.`);
                                this._addActivity(`[${accountId}] Dialogue with ${activePeer} finished.`, 'success');
                            }
                        }
                    } else {
                        console.log(`[WARMER-${accountId}] 🍃 [Step 1/3] Opening Random Chat...`);
                        this._addActivity(`[${accountId}] Mimicking random usage patterns...`, 'action');
                        await this.behavior.openRandomChat(page);
                        console.log(`[WARMER-${accountId}] 🍃 [Step 2/3] Scrolling & Reading...`);
                        await this.behavior.scrollChatList(page);
                        await this.behavior.scrollChat(page);
                        console.log(`[WARMER-${accountId}] 🍃 [Step 3/3] Simulating Ghost Typing...`);
                        await this.behavior.simulateTyping(page);
                        this._addActivity(`[${accountId}] Random interaction complete.`, 'success');
                    }
                } catch (seqErr) {
                    console.error(`[WARMER-${accountId}] Sequence error:`, seqErr.message);
                }

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
