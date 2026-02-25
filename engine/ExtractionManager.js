const EventEmitter = require('events');
const ExtractionWorker = require('./ExtractionWorker');
const fs = require('fs');
const path = require('path');

/**
 * ExtractionManager acts as the central orchestrator for all automation tasks.
 * it manages the worker pool, outreach campaigns, and the survivability engine.
 */
class ExtractionManager extends EventEmitter {
    constructor({ registry, campaignManager, licenseManager }) {
        super();
        this.registry = registry;
        this.campaignManager = campaignManager;
        this.licenseManager = licenseManager;

        this.workers = new Map();
        this.workerAutoReplyOverrides = new Map();
        this.outboundLedger = new Map();

        this.isStealth = false;
        this.isPaused = false;
        this.autoReplySettings = {
            enabled: false,
            rules: []
        };

        // Survivability Modules
        const SurvivabilityLedger = require('./survivability/SurvivabilityLedger');
        this.survivability = new SurvivabilityLedger(this.registry.logsDir);

        const SurvivabilityEngine = require('./survivability/SurvivabilityEngine');
        this.engine = new SurvivabilityEngine(this.survivability, this.registry.logsDir);

        this.ledgerPath = path.join(this.registry.logsDir, 'titan-ledger.json');
        this._loadLedger();
    }

    /**
     * Aggregates survivability metrics for all established accounts.
     */
    async getSurvivabilityStats() {
        const messageStates = await this.survivability.getMessageStates();
        const registryAccounts = this.registry.getAccounts();

        let totalSent = 0;
        let totalReplied = 0;
        let totalDelivered = 0;
        let totalRiskScore = 0;
        let riskyCount = 0;
        let criticalCount = 0;

        const accountStats = await Promise.all(registryAccounts.map(async (acc) => {
            const number = acc.number;
            const metrics = await this.engine.getAccountMetrics(number);
            const score = await this.engine.calculateSurvivabilityScore(number);
            const eventCount = (await this.survivability.getAccountEvents(number)).length;
            const isTraining = eventCount < 50;

            const status = score > 80 ? 'READY' : score > 60 ? 'RISK' : 'CRITICAL';
            const color = score > 80 ? '#22c55e' : score > 60 ? '#f59e0b' : '#ef4444';
            const remark = this.engine.getRemark(score, metrics);

            if (status === 'RISK') riskyCount++;
            if (status === 'CRITICAL') criticalCount++;

            if (metrics) {
                totalSent += metrics.totalSent || 0;
                totalReplied += messageStates.filter(m => m.account_id === number && m.reply_received).length;
                totalDelivered += messageStates.filter(m => m.account_id === number && m.ack_state >= 2).length;
                totalRiskScore += score;
            }

            return {
                number: number,
                healthScore: score,
                status: status,
                color: color,
                remark: remark,
                isTraining: isTraining,
                messagesProcessed: metrics?.totalSent || 0,
                metrics: {
                    deliveryRate: metrics?.last100?.deliveryRate || 0,
                    otr: metrics?.last100?.otr || 0,
                    replyRate: metrics?.last100?.replyRate || 0,
                    failureRate: metrics?.last100?.failureRate || 0,
                    latency: metrics?.last100?.medianLatency || 0
                },
                connectionStatus: this.workers.has(number) ? 'ACTIVE' : 'IDLE'
            };
        }));

        const avgHealth = registryAccounts.length > 0 ? Math.floor(totalRiskScore / registryAccounts.length) : 100;
        const globalStatus = avgHealth > 80 ? 'READY' : avgHealth > 60 ? 'RISK' : 'CRITICAL';
        const globalColor = avgHealth > 80 ? '#22c55e' : avgHealth > 60 ? '#f59e0b' : '#ef4444';

        let globalRemark = 'ALL SYSTEMS NOMINAL. NO ANOMALIES DETECTED IN MESSAGE PROPAGATION.';
        if (criticalCount > 0) {
            globalRemark = `CRITICAL: ${criticalCount} ACCOUNT(S) AT HIGH RISK OF RESTRICTION. IMMEDIATE INVESTIGATION REQUIRED.`;
        } else if (riskyCount > 0) {
            globalRemark = `WARNING: ${riskyCount} ACCOUNT(S) EXHIBITING ANOMALOUS DELIVERY PATTERNS. MONITOR OTR METRICS.`;
        }

        return {
            overview: {
                totalHealth: avgHealth,
                status: globalStatus,
                color: globalColor,
                remark: globalRemark,
                riskAccounts: riskyCount,
                criticalAccounts: criticalCount,
                totalSent: totalSent,
                repliesReceived: totalReplied,
                avgDeliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
                activeDevicesCount: this.workers.size,
                globalDbSize: registryAccounts.reduce((sum, a) => sum + (a.lifetimeCount || 0), 0)
            },
            accounts: accountStats
        };
    }

    /**
     * Records a new outbound strike in the survivability ledger.
     */
    async recordOutreachStrike({ messageId, accountId, recipientId }) {
        await this.survivability.logEvent({
            message_id: messageId,
            account_id: accountId,
            recipient_id: recipientId,
            timestamp_sent: Date.now(),
            ack_state: 0,
            failed: false,
            reply_received: false,
            delivery_latency_ms: 0
        });
    }

    /**
     * Updates an existing event when a delivery acknowledgement is received.
     */
    async recordAckEvent({ messageId, ackState, latency, timestampSent }) {
        const calculatedLatency = latency || (Date.now() - (timestampSent || Date.now()));
        await this.survivability.updateEvent(messageId, {
            ack_state: ackState,
            timestamp_ack: Date.now(),
            delivery_latency_ms: calculatedLatency
        });
    }

    /**
     * Loads the persistence ledger for outbound contexts.
     */
    _loadLedger() {
        try {
            if (fs.existsSync(this.ledgerPath)) {
                const data = fs.readFileSync(this.ledgerPath, 'utf8');
                this.outboundLedger = new Map(JSON.parse(data));
                console.log(`[MANAGER] 📚 Loaded Outbound Ledger: ${this.outboundLedger.size} active contexts`);
            }
        } catch (err) {
            console.error('[MANAGER] ⚠️ Failed to load ledger:', err.message);
        }
    }

    /**
     * Saves the persistence ledger to disk.
     */
    _saveLedger() {
        try {
            const data = JSON.stringify(Array.from(this.outboundLedger.entries()), null, 2);
            fs.writeFileSync(this.ledgerPath, data);
        } catch (err) {
            console.error('[MANAGER] ⚠️ Failed to save ledger:', err.message);
        }
    }

    /**
     * Updates global auto-reply settings or specifically for one worker.
     */
    setAutoReplySettings(settings) {
        if (settings.number) {
            console.log(`[MANAGER] 🤖 Routing Auto-Reply Update to Worker ${settings.number}: ${settings.enabled ? 'ACTIVE' : 'INACTIVE'}`);
            this.updateWorkerConfig(settings.number, { autoReply: settings.enabled });
        } else {
            if (typeof settings.enabled !== 'undefined') {
                this.autoReplySettings.enabled = settings.enabled;
            }
        }

        if (settings.rules) {
            this.autoReplySettings.rules = settings.rules;
        }

        console.log(`[MANAGER] 🤖 Auto-Reply Rules Synced: ${this.autoReplySettings.rules?.length || 0}`);

        // Sync to already running workers
        for (const worker of this.workers.values()) {
            worker.setAutoReplySettings(this.autoReplySettings);
        }
    }

    /**
     * Per-worker configuration overrides.
     */
    updateWorkerConfig(number, config) {
        console.log(`[MANAGER] 🔧 Worker Config Update: ${number} | autoReply: ${config.autoReply}`);
        this.workerAutoReplyOverrides.set(number, config);
    }

    /**
     * Stealth mode reduces browser fingerprint and throttles actions.
     */
    setStealthMode(enabled) {
        this.isStealth = enabled;
        console.log(`[MANAGER] Global Stealth Mode set to: ${enabled}`);
    }

    pauseAll() {
        console.log('[MANAGER] ⏸️ PAUSING ALL PROCESSING');
        this.isPaused = true;
    }

    resumeAll() {
        console.log('[MANAGER] ▶️ RESUMING ALL PROCESSING');
        this.isPaused = false;
    }

    /**
     * Spins up a new ExtractionWorker for a number.
     */
    async startAccount(number) {
        console.log(`[MANAGER] Starting account: ${number}`);

        if (this.workers.has(number)) {
            const worker = this.workers.get(number);
            if (worker.client?.pupBrowser?.isConnected()) {
                console.log(`[MANAGER] Worker ${number} already exists and is alive`);
                return;
            }
            console.log(`[MANAGER] Worker ${number} exists but browser is dead. Cleaning up...`);
            await this.closeAccount(number);
        }

        try {
            const accData = this.registry.getAccount(number);
            const worker = new ExtractionWorker({
                number: number,
                sessionPath: accData.sessionPath,
                registry: this.registry
            });

            worker.setAutoReplySettings(this.autoReplySettings);
            this.workers.set(number, worker);

            // Hook Events
            worker.on('qr', q => this.emit('qr', { number, qr: q }));
            worker.on('ready', () => {
                console.log(`[MANAGER] Worker ${number} ready`);
                this.emit('account_ready', { number });
            });
            worker.on('error', err => {
                console.error(`[MANAGER] Worker ${number} error:`, err);
                this.emit('error', { number, error: err.message });
            });
            worker.on('disconnected', () => {
                console.log(`[MANAGER] Worker ${number} disconnected`);
                this.workers.delete(number);
                this.emit('account_disconnected', { number });
            });

            worker.on('message_received', payload => {
                this._handleIncomingMessage(number, payload);
                this.emit('message_received', { number, ...payload });
            });

            worker.on('message_ack', payload => {
                const ledgerEntry = [...this.outboundLedger.values()].find(e => e.lastMessageId === payload.messageId);
                this.recordAckEvent({
                    messageId: payload.messageId,
                    ackState: payload.ackState,
                    timestampSent: ledgerEntry?.timestamp
                });
                this.emit('message_ack', { number, ...payload });
            });

            worker.on('bot_simulation', update => {
                this.emit('bot_activity', {
                    time: new Date().toLocaleTimeString(),
                    action: update.action,
                    details: update.details
                });
            });

            worker.on('group_stream', update => {
                const isComplete = update.groups.length === 1 && update.groups[0].isComplete;
                if (isComplete) {
                    this.emit('discovery:complete', { number, groups: worker.getGroupCache() });
                } else {
                    this.emit('discovery:progress', { number, groups: update.groups });
                }
            });

            worker.on('metadata_update', update => {
                this.emit('metadata:progress', update);
            });

            // Start initialization (headless launch)
            worker.initialize().then(() => {
                console.log(`[MANAGER] ✅ Account ${number} initialized successfully`);
            }).catch(err => {
                console.error(`[MANAGER] ❌ Worker ${number} initialization failed:`, err.message);
                this.emit('error', { number, error: `Initialization failed: ${err.message}` });
            });

            console.log(`[MANAGER] Account ${number} registered (initializing in background...)`);
        } catch (err) {
            console.error(`[MANAGER] Failed to create worker for ${number}:`, err);
            this.workers.delete(number);
            this.emit('error', { number, error: err.message });
        }
    }

    /**
     * Internal: wait for a worker to finish 'ready' event.
     */
    async _ensureWriterReady(worker) {
        if (worker.isReady) return;

        console.log(`[MANAGER] Worker ${worker.number} is still initializing, waiting...`);
        return new Promise((resolve, reject) => {
            const onReady = () => { cleanup(); resolve(); };
            const onError = (e) => { cleanup(); reject(e); };
            const cleanup = () => {
                worker.off('ready', onReady);
                worker.off('error', onError);
            };

            worker.once('ready', onReady);
            worker.once('error', onError);

            setTimeout(() => {
                cleanup();
                reject(new Error('Timeout waiting for worker initialization'));
            }, 180000); // 3 mins
        });
    }

    /**
     * Triggers group discovery on an account.
     */
    async getGroups(number) {
        console.log(`[MANAGER] 🔍 IPC Request -> getGroups for ${number}`);
        const worker = this.workers.get(number);

        if (!worker) {
            throw new Error(`Worker not found for ${number}. Please refresh or re-login.`);
        }

        try {
            await this._ensureWriterReady(worker);
            console.log(`[MANAGER] ✅ Worker ${number} is ready. Dispatching Pipeline A (Discovery)...`);

            worker.extractionState.phase = 'DISCOVERING';
            const groups = await worker.getGroups();

            console.log(`[MANAGER] 📊 Auto-triggering Pipeline B (Metadata) for ${number}...`);
            worker._countMetadata().catch(err => {
                console.error(`[MANAGER] ❌ Pipeline B failed for ${number}:`, err.message);
            });

            return groups;
        } catch (err) {
            console.error(`[MANAGER] ❌ Discovery Prep Failed for ${number}:`, err.message);
            throw err;
        }
    }

    /**
     * Executes extraction tasks across a list of group IDs.
     */
    async extractGroups(number, groupIds, options = {}) {
        const worker = this.workers.get(number);
        if (!worker) throw new Error('Worker not found for ' + number);

        await this._ensureWriterReady(worker);

        if (this.licenseManager) {
            const { allowed, reason } = await this.licenseManager.checkLimit('extraction');
            if (!allowed) throw new Error(`[TITAN LICENSE] ${reason}`);
        }

        worker.extractionState.phase = 'EXTRACTING';
        worker.isCancelled = false;

        this.emit('account:extract:start', { number, groups: groupIds });

        const { onProgress } = options;
        const results = [];
        let groupIndex = 0;

        try {
            for (groupIndex = 0; groupIndex < groupIds.length; groupIndex++) {
                const gid = groupIds[groupIndex];
                console.log(`[MANAGER] Extracting group ${groupIndex + 1}/${groupIds.length}: ${gid}`);

                const state = this.registry.getExtractionState(number);
                let resumeFrom = 0;
                if (state && state.groupId === gid) {
                    resumeFrom = state.processedCount || 0;
                }

                if (worker.isCancelled) break;

                const contacts = await worker.extractGroupContacts(gid, {
                    resumeFrom,
                    onProgress: (p) => {
                        if (onProgress) {
                            onProgress({
                                groupIndex: groupIndex,
                                groupTotal: groupIds.length,
                                ...p
                            });
                        }
                    }
                });

                worker.appendContacts(contacts);
                results.push(...contacts);

                this.emit('account:extract:progress', {
                    number,
                    contacts,
                    progress: {
                        groupIndex: groupIndex + 1,
                        groupTotal: groupIds.length,
                        totalExtracted: results.length,
                        message: `Completed group ${groupIndex + 1}/${groupIds.length}`
                    }
                });

                if (onProgress) {
                    onProgress({
                        groupIndex: groupIndex + 1,
                        groupTotal: groupIds.length,
                        totalExtracted: results.length,
                        message: `Completed group ${groupIndex + 1}/${groupIds.length}`
                    });
                }
            }

            this.registry.incrementUsage(number, results.length);
            if (this.licenseManager) {
                this.licenseManager.incrementUsage('extraction', results.length).catch(() => { });
            }

            console.log(`[MANAGER] Extraction Complete. Total matched: ${results.length} contacts`);
            this.emit('account:extract:complete', { number, contactCount: results.length });

            return results;
        } catch (err) {
            console.error(`[MANAGER] Extraction Task Failed for ${number}:`, err);
            this.registry.updateExtractionState(number, {
                groupIds,
                processedGroups: groupIndex,
                totalContacts: results.length,
                timestamp: Date.now(),
                error: err.message
            });
            this.emit('error', { number, error: err.message });
            throw err;
        } finally {
            worker.extractionState.phase = 'IDLE';
        }
    }

    clearContacts(number) {
        const worker = this.workers.get(number);
        if (worker) worker.clearContactsCache();
    }

    clearAllData(number) {
        const worker = this.workers.get(number);
        if (worker) {
            worker.clearGroupsCache();
            worker.clearContactsCache();
        }
        if (this.registry) {
            this.registry.clearExtractionState(number);
        }
    }

    async closeAccount(number) {
        console.log(`[MANAGER] Closing account worker: ${number}`);
        const worker = this.workers.get(number);
        if (worker) {
            await worker.close();
            this.workers.delete(number);
        }
    }

    async closeAll() {
        console.log('[MANAGER] Gracefully closing all workers...');
        for (const [number, worker] of this.workers) {
            try { await worker.close(); } catch (e) { }
        }
        this.workers.clear();
    }

    stopAllCampaigns() {
        console.log('[MANAGER] 🛑 USER COMMAND: STOP ALL CAMPAIGNS (preserving worker handles)');
        for (const worker of this.workers.values()) {
            worker.isCancelled = true;
        }
    }

    /**
     * Executes an outreach campaign for a specific account.
     */
    async runCampaignForNumber(number, campaignId, config = {}) {
        const worker = this.workers.get(number);
        if (!worker) throw new Error('Worker not found for ' + number);

        await this._ensureWriterReady(worker);

        if (this.licenseManager) {
            const { allowed, reason } = await this.licenseManager.checkLimit('message');
            if (!allowed) throw new Error(`[TITAN LICENSE] ${reason}`);
        }

        const queue = this.campaignManager.getQueue(campaignId, number);
        if (!queue) throw new Error('Queue not found');

        console.log(`[MANAGER] STARTING OUTREACH for ${number}: ${queue.total} contacts`);

        const { delayMin = 60, delayMax = 120, variants = ['Hi'] } = config;
        let sentCount = queue.sent || 0;
        let failedCount = queue.failed || 0;

        worker.isCancelled = false;

        try {
            for (let i = 0; i < queue.contacts.length; i++) {
                // Pause handling
                while (this.isPaused && !worker.isCancelled) {
                    await worker._delay(2000);
                }

                const contact = queue.contacts[i];
                if (contact.status === 'SENT' || contact.status === 'FAILED') continue;
                if (worker.isCancelled) {
                    console.log(`[MANAGER] Outreach CANCELLED for ${number}`);
                    break;
                }

                // Variant Selection
                let vIdx;
                if (typeof config.variantIndex === 'undefined' || config.variantIndex === 'auto') {
                    vIdx = i % variants.length;
                } else {
                    vIdx = parseInt(config.variantIndex);
                }

                let text = variants[vIdx] || variants[0];
                contact.variantNum = vIdx + 1;
                text = text.replace(/{name}/gi, (contact.name && contact.name !== 'Manual Lead') ? contact.name : 'there');

                const jid = contact.phone.includes('@') ? contact.phone : contact.phone + '@c.us';
                contact.senderNumber = number;

                const mediaMode = config.mediaSendMode || 'combined';
                console.log(`[MANAGER] [${number}] Sending (V#${vIdx + 1}) to ${jid} | Mode: ${mediaMode}`);

                let result = { success: false };
                try {
                    if (mediaMode === 'text_only' || !config.attachedMedia) {
                        result = await worker.sendMessage(jid, text, null);
                    } else if (mediaMode === 'combined') {
                        result = await worker.sendMessage(jid, text, config.attachedMedia);
                    } else if (mediaMode === 'media_first') {
                        const mRes = await worker.sendMessage(jid, null, config.attachedMedia);
                        if (mRes.success) {
                            await worker._delay(1500);
                            result = await worker.sendMessage(jid, text, null);
                        } else {
                            result = mRes;
                        }
                    } else if (mediaMode === 'text_first') {
                        const tRes = await worker.sendMessage(jid, text, null);
                        if (tRes.success) {
                            await worker._delay(1500);
                            result = await worker.sendMessage(jid, null, config.attachedMedia);
                        } else {
                            result = tRes;
                        }
                    }
                } catch (sendErr) {
                    console.error(`[MANAGER] [${number}] Worker Crash during send:`, sendErr.message);
                    const msg = (sendErr.message || '').toLowerCase();
                    if (msg.includes('protocol') || msg.includes('timeout') || msg.includes('disconnected') || msg.includes('session lost')) {
                        console.log(`[MANAGER] 🛡️ AUTO-PAUSE TRIGGERED: Critical instability for ${number}. Pausing campaign...`);
                        this.pauseAll();
                        this.emit('error', { number, error: `Critical Error (Auto-Paused): ${sendErr.message}` });
                        i--; // Retry this lead after pause
                        continue;
                    }
                    result = { success: false, error: sendErr.message };
                }

                if (result.success) {
                    contact.status = 'SENT';
                    sentCount++;

                    this.licenseManager?.incrementUsage('message', 1).catch(() => { });

                    // Ledger Recording
                    this.outboundLedger.set(jid, {
                        campaignId,
                        variantIdx: vIdx,
                        timestamp: Date.now(),
                        repliesSent: 0,
                        hasReplied: false,
                        triggeredRules: [],
                        humanInterrupted: false,
                        lastMessageId: result.messageId
                    });

                    this.recordOutreachStrike({
                        messageId: result.messageId,
                        accountId: number,
                        recipientId: jid
                    }).catch(e => console.error('[MANAGER] Ledger Record Failed:', e.message));

                    this._saveLedger();
                    this.campaignManager.incrementVariantSent(campaignId, vIdx);
                } else {
                    console.error(`[MANAGER] [${number}] !!! SEND FAILURE !!! JID: ${jid} Error: ${result.error || 'Unknown'}`);
                    contact.status = 'FAILED';
                    failedCount++;
                }

                // Progress Report
                this.campaignManager.updateQueueProgress(campaignId, number, {
                    sent: sentCount,
                    failed: failedCount,
                    contacts: queue.contacts,
                    status: worker.isCancelled ? 'CANCELLED' : (sentCount + failedCount >= queue.total ? 'COMPLETE' : 'RUNNING')
                });

                // Sequence Delay
                if (i < queue.contacts.length - 1 && !worker.isCancelled) {
                    let dMin = Math.max(5, Number(delayMin));
                    let dMax = Math.max(10, Number(delayMax));
                    if (dMin > dMax) [dMin, dMax] = [dMax, dMin];

                    const waitSecs = Math.floor(Math.random() * (dMax - dMin + 1)) + dMin;
                    console.log(`[MANAGER] [${number}] ⏳ DELAY SEQUENCE: ${waitSecs}s (Range: ${dMin}-${dMax})`);

                    this.emit('campaign:status', {
                        campaignId,
                        status: 'WAITING',
                        details: `Randomized Delay: ${waitSecs}s`,
                        duration: waitSecs
                    });

                    // Interactive delay loop (supports pause/cancel)
                    let msLeft = waitSecs * 1000;
                    while (msLeft > 0) {
                        if (worker.isCancelled) break;
                        let wasPaused = false;
                        while (this.isPaused) {
                            wasPaused = true;
                            this.emit('campaign:status', { campaignId, status: 'PAUSED', details: 'Campaign Paused' });
                            await new Promise(r => setTimeout(r, 500));
                            if (worker.isCancelled) break;
                        }

                        if (wasPaused && !worker.isCancelled && msLeft > 0) {
                            this.emit('campaign:status', {
                                campaignId,
                                status: 'WAITING',
                                details: 'Resuming delay...',
                                duration: Math.ceil(msLeft / 1000)
                            });
                        }

                        await new Promise(r => setTimeout(r, 100));
                        msLeft -= 100;
                    }

                    if (!worker.isCancelled && !this.isPaused) {
                        this.emit('campaign:status', { campaignId, status: 'RUNNING', details: 'Sending next message...' });
                    }
                }
            }
        } catch (fatalErr) {
            console.error(`[MANAGER] [${number}] FATAL CAMPAIGN ERROR:`, fatalErr);
        }

        this.registry.incrementUsage(number, sentCount);
        console.log(`[MANAGER] Outreach FINISHED for ${number}. Sent: ${sentCount}, Failed: ${failedCount}`);
    }

    /**
     * Core logic for handling incoming messages and coordinating auto-replies.
     */
    async _handleIncomingMessage(number, { from, body, fromMe, isBot, timestamp }) {
        console.log(`[MANAGER-${number}] 📨 RECV: ${from} | body: "${body?.substring(0, 20)}..."`);

        const worker = this.workers.get(number);
        if (!worker) return;

        // Find ledger entry (handle JID variants)
        let entry = this.outboundLedger.get(from);
        if (!entry) {
            const bare = from.split('@')[0];
            entry = this.outboundLedger.get(bare + '@c.us') || this.outboundLedger.get(bare);
        }

        if (!entry) return;

        // Grace period check (48 hours for valid outreach response)
        const outreachWindow = 48 * 60 * 60 * 1000;
        if (Date.now() - entry.timestamp > outreachWindow) return;

        // Human Interruption Check
        if (fromMe) {
            if (isBot) return; // Ignore our own bot replies
            entry.humanInterrupted = true;
            this._saveLedger();
            console.log(`[MANAGER] 🛡️ PERMANENT HUMAN TAKEOVER for ${from}. Guardian disabled.`);
            this.emit('bot_activity', {
                time: new Date().toLocaleTimeString(),
                lead: from.split('@')[0],
                action: 'OPERATOR_STOP',
                details: (body || '').substring(0, 30) + ((body?.length > 30) ? '...' : '')
            });
            return;
        }

        // Internal message check (ignore messages between our own workers)
        if (this.workers.has(from.split('@')[0])) return;

        // Determine if auto-reply is active for this specific worker/context
        const override = this.workerAutoReplyOverrides.get(number);
        let arActive = this.autoReplySettings.enabled;
        if (override && typeof override.autoReply === 'boolean') {
            arActive = override.autoReply;
        }

        if (!arActive && entry.hasReplied) return;
        if (entry.humanInterrupted) return;

        const incomingText = (body || '').toLowerCase().trim();
        if (!incomingText) return;

        // Echo protection: check if incoming msg is just a variant echo
        const campaign = this.campaignManager.getCampaignState(entry.campaignId);
        if (campaign && campaign.variants) {
            const isEcho = campaign.variants.some(v => {
                const cleanV = v.toLowerCase().replace(/{name}/g, '').trim();
                // Match if mostly similar or starts with
                if (incomingText.length > 20 && incomingText === cleanV) return true;
                if (incomingText.length > 30 && incomingText.includes(cleanV.substring(0, 20))) return true;
                return false;
            });
            if (isEcho) {
                console.log(`[MANAGER] 🛑 Ignoring campaign variant echo from ${from}`);
                return;
            }
        }

        // Record first reply if not already tracked
        if (!entry.hasReplied) {
            const nowUnix = Math.floor(Date.now() / 1000);
            if (timestamp && (nowUnix - timestamp > 60)) {
                console.log(`[MANAGER] ⏳ Ignoring old message from ${from} (${nowUnix - timestamp}s old)`);
                return;
            }

            // Loop checking (detection of recipient auto-responder)
            const lastWorkerResp = worker._lastResponseTimes ? worker._lastResponseTimes.get(from) : 0;
            if (lastWorkerResp && timestamp && (timestamp - lastWorkerResp < 5)) {
                console.log(`[MANAGER] 🤖 Bot Intercepted: Message from ${from} arrived in ${timestamp - lastWorkerResp}s. Ignoring.`);
                this.emit('bot_activity', {
                    time: new Date().toLocaleTimeString(),
                    lead: from.split('@')[0],
                    action: 'ERROR',
                    details: `Bot-Loop Intercepted: Recipient Auto-Responder ignored (${timestamp - lastWorkerResp}s).`
                });
                return;
            }

            entry.hasReplied = true;
            if (entry.lastMessageId) {
                this.survivability.updateEvent(entry.lastMessageId, { reply_received: true });
            }
            this.campaignManager.incrementVariantReplied(entry.campaignId, entry.variantIdx, number);
            this._saveLedger();

            this.emit('bot_activity', {
                time: new Date().toLocaleTimeString(),
                lead: from.split('@')[0],
                action: 'CONVERSION',
                details: `First Reply: "${body.substring(0, 40)}${body.length > 40 ? '...' : ''}"`
            });
        }

        // Rule-based Keyword Matching
        let bestMatch = null;
        for (const [idx, rule] of this.autoReplySettings.rules.entries()) {
            if (!rule.keyword || !rule.response) continue;
            if (entry.triggeredRules && entry.triggeredRules.includes(idx)) continue;

            const keywords = rule.keyword.split(',').map(k => k.trim().toLowerCase()).filter(k => k);
            const mode = rule.mode || 'phrase';

            let matched = false;
            let matchLength = 0;

            keywords.forEach(kw => {
                let isHit = false;
                if (mode === 'exact') isHit = incomingText === kw;
                else if (incomingText.includes(kw)) isHit = true;
                else if (kw.length >= 3) {
                    // Smart fuzzy check
                    const words = incomingText.split(/\s+/);
                    isHit = words.some(word => {
                        if (word.length < 3) return false;
                        const kwSub = kw.substring(0, Math.max(3, kw.length - 1));
                        const wordSub = word.substring(0, Math.max(3, word.length - 1));
                        return word.startsWith(kwSub) || kw.startsWith(wordSub);
                    });
                }

                if (isHit && kw.length > matchLength) {
                    matchLength = kw.length;
                    matched = true;
                }
            });

            if (matched) {
                if (!bestMatch || matchLength > bestMatch.keyLength) {
                    bestMatch = { rule, idx, keyLength: matchLength };
                }
            }
        }

        // Trigger Auto-Reply
        if (bestMatch) {
            if (!arActive) {
                console.log(`[MANAGER] 🎯 Best match found ('${bestMatch.rule.keyword}') but Auto-Reply is DISABLED.`);
                return;
            }

            const { rule, idx } = bestMatch;
            if (!entry.repliesSent) entry.repliesSent = 0;

            if (entry.repliesSent < 5) { // Cap per lead to prevent infinite loops
                entry.repliesSent++;
                if (!entry.triggeredRules) entry.triggeredRules = [];
                entry.triggeredRules.push(idx);

                console.log(`[MANAGER] 🛡️ BEST MATCH SELECTED: '${rule.keyword}' (Length: ${bestMatch.keyLength}) for ${from}`);

                worker.dispatchHumanReply(from, rule.response);
                this._saveLedger();
            }
        }
    }
}

module.exports = ExtractionManager;