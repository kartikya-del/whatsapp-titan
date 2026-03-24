const EventEmitter = require('events')
const ExtractionWorker = require('./ExtractionWorker')
const fs = require('fs')
const path = require('path')

class ExtractionManager extends EventEmitter {
    constructor({ registry, campaignManager, licenseManager }) {
        super()
        this.registry = registry
        this.campaignManager = campaignManager
        this.licenseManager = licenseManager
        this.workers = new Map()
        this.extractions = new Map()
        this.activeCampaigns = new Map()
        this.isStealth = false
        this.isPaused = false
        this.autoReplySettings = { enabled: false, rules: [] }
        this.workerAutoReplyOverrides = new Map()
        this.outboundLedger = new Map()

        // Survivability Modules (Titan 1.0.11 Core)
        const SurvivabilityLedger = require('./survivability/SurvivabilityLedger')
        this.survivability = new SurvivabilityLedger(this.registry.logsDir)

        const SurvivabilityEngine = require('./survivability/SurvivabilityEngine')
        this.engine = new SurvivabilityEngine(this.survivability, this.registry.logsDir)

        // TITAN 5-LANE HIGHWAY (Priority Isolation)
        this.pipelines = new Map(); // account -> 5-Lane Object
        this.flushInterval = 40; // Optimal pulse for 5 lanes
        this._startHighwayLoop();
    }

    _startHighwayLoop() {
        setInterval(() => {
            if (this.pipelines.size === 0) return;

            for (const [number, lanes] of this.pipelines.entries()) {
                // LANE 1: COMMAND (Priority Alpha)
                if (lanes.command.length > 0) {
                    this.emit('highway:command', { number, data: [...lanes.command] });
                    lanes.command = [];
                }

                // LANE 2: TURBO (High Volume)
                if (lanes.turbo.length > 0) {
                    this.emit('highway:turbo', { number, contacts: [...lanes.turbo] });
                    lanes.turbo = [];
                }

                // LANE 3: DISCOVERY (Metadata)
                if (lanes.discovery.length > 0) {
                    this.emit('highway:discovery', { number, updates: [...lanes.discovery] });
                    lanes.discovery = [];
                }

                // LANE 4: PULSE (Telemetry)
                if (lanes.pulse) {
                    this.emit('highway:pulse', { number, stats: lanes.pulse });
                    lanes.pulse = null;
                }

                // LANE 5: SYSTEM (Health)
                if (lanes.system.length > 0) {
                    this.emit('highway:system', { number, events: [...lanes.system] });
                    lanes.system = [];
                }
            }
        }, this.flushInterval);
    }

    _ensurePipeline(number) {
        if (!this.pipelines.has(number)) {
            this.pipelines.set(number, {
                selection: new Set(),
                command: [],
                turbo: [],
                discovery: [],
                pulse: null,
                system: []
            });
        }
        return this.pipelines.get(number);
    }

    _pushToLane(number, lane, data) {
        const p = this._ensurePipeline(number);
        if (lane === 'turbo') p.turbo.push(...data);
        if (lane === 'discovery') p.discovery.push(...data);
        if (lane === 'command') p.command.push(data);
        if (lane === 'pulse') p.pulse = data;
        if (lane === 'system') p.system.push(data);
    }

    syncAccountState(number) {
        const pipe = this._ensurePipeline(number);
        this._pushToLane(number, 'command', {
            type: 'STATE_SYNC',
            selected: Array.from(pipe.selection),
            count: pipe.selection.size
        });
    }



    clearAccountBuffer(number) {
        // 1. Instantly abort any ongoing worker loops (Metadata/Discovery)
        const worker = this.workers.get(number);
        if (worker) {
            worker.extractionState.phase = 'IDLE';
            worker.isCancelled = true;
        }

        // 2. Highway Wipe
        const p = this.pipelines.get(number);
        if (p) {
            p.selection.clear();
            p.command = [];
            p.turbo = [];
            p.discovery = [];
            p.pulse = null;
            p.system = [{ type: 'UI_WIPE' }];
        }

        // 3. Reset Registry Counts (1.0.11 Discrete Mode)
        this.registry.resetUsage(number);

        // 4. Force a "Wipe Signal" down the system lane
        this._pushToLane(number, 'system', { type: 'STATE_RESET' });
        this.syncAccountState(number);
    }

    clearAccountData(number) {
        const worker = this.workers.get(number);
        if (worker) {
            // TITAN: Preserve groups and groupCache to keep left panel visible after clear
            worker.contacts = [];
        }

        // Wipe registry and UI lanes for contacts only
        this.clearAccountBuffer(number);
    }

    _loadLedger() {
        try {
            if (fs.existsSync(this.ledgerPath)) {
                const raw = fs.readFileSync(this.ledgerPath, 'utf8')
                this.outboundLedger = new Map(JSON.parse(raw))
                console.log(`[MANAGER] 📚 Loaded Outbound Ledger: ${this.outboundLedger.size} active contexts`)
            }
        } catch (err) { console.error('[MANAGER] ⚠️ Ledger Fail:', err.message) }
    }

    _saveLedger() {
        try {
            const data = JSON.stringify(Array.from(this.outboundLedger.entries()), null, 2)
            fs.writeFileSync(this.ledgerPath, data)
        } catch (err) { }
    }

    /**
     * Aggregates survivability metrics for all established accounts.
     * Required by 1.0.11 Interface.
     */
    async getSurvivabilityStats() {
        const messageStates = await this.survivability.getMessageStates()
        const registryAccounts = this.registry.listAccounts()

        let totalSent = 0
        let totalReplied = 0
        let totalDelivered = 0
        let totalRiskScore = 0
        let riskyCount = 0
        let criticalCount = 0

        const accountStats = await Promise.all(registryAccounts.map(async (acc) => {
            const number = acc.number
            const metrics = await this.engine.getAccountMetrics(number)
            const score = await this.engine.calculateSurvivabilityScore(number)
            const eventCount = (await this.survivability.getAccountEvents(number)).length
            const isTraining = eventCount < 50

            const status = score > 80 ? 'READY' : score > 60 ? 'RISK' : 'CRITICAL'
            const color = score > 80 ? '#22c55e' : score > 60 ? '#f59e0b' : '#ef4444'
            const remark = this.engine.getRemark(score, metrics)

            if (status === 'RISK') riskyCount++
            if (status === 'CRITICAL') criticalCount++

            if (metrics) {
                totalSent += metrics.totalSent || 0
                totalReplied += messageStates.filter(m => m.account_id === number && m.reply_received).length
                totalDelivered += messageStates.filter(m => m.account_id === number && m.ack_state >= 2).length
                totalRiskScore += score
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
            }
        }))

        const avgHealth = registryAccounts.length > 0 ? Math.floor(totalRiskScore / registryAccounts.length) : 100
        
        // TITAN 3.0: Simplified overview structure for the dashboard
        const overview = {
            totalHealth: avgHealth,
            status: avgHealth > 80 ? 'SAFE' : avgHealth > 60 ? 'CAUTION' : 'AT RISK',
            color: avgHealth > 80 ? '#22c55e' : avgHealth > 60 ? '#f59e0b' : '#ef4444',
            remark: 'all systems normal. your accounts are safe and working well.',
            riskAccounts: riskyCount,
            criticalAccounts: criticalCount,
            avgDeliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 100,
            activeDevicesCount: this.workers.size, // Fixed: Real active count
            totalSent,
            repliesReceived: totalReplied
        }

        return {
            overview,
            accounts: accountStats,
            alerts: { critical: criticalCount, warning: riskyCount }
        }
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
        })
    }

    /**
     * Updates an existing event when a delivery acknowledgement is received.
     */
    async recordAckEvent({ messageId, ackState, latency, timestampSent }) {
        const calculatedLatency = latency || (Date.now() - (timestampSent || Date.now()))
        await this.survivability.updateEvent(messageId, {
            ack_state: ackState,
            timestamp_ack: Date.now(),
            delivery_latency_ms: calculatedLatency
        })
    }

    setAutoReplySettings(settings) {
        if (settings.number) {
            this.updateWorkerConfig(settings.number, { autoReply: settings.enabled })
        } else {
            if (typeof settings.enabled !== 'undefined') this.autoReplySettings.enabled = settings.enabled
        }
        if (settings.rules) this.autoReplySettings.rules = settings.rules
        for (const worker of this.workers.values()) {
            worker.setAutoReplySettings(this.autoReplySettings)
        }
    }

    updateWorkerConfig(number, config) {
        this.workerAutoReplyOverrides.set(number, config)
    }

    setStealthMode(enabled) { this.isStealth = enabled; }
    pauseAll() { this.isPaused = true; }
    resumeAll() { this.isPaused = false; }

    async startAccount(number) {
        if (this.workers.has(number)) {
            const existing = this.workers.get(number)
            if (existing.client?.pupBrowser?.isConnected()) return
            await this.closeAccount(number)
        }

        try {
            const account = this.registry.getAccount(number)
            const worker = new ExtractionWorker({
                number,
                sessionPath: account.sessionPath,
                registry: this.registry
            })

            worker.setAutoReplySettings(this.autoReplySettings)
            this.workers.set(number, worker)

            worker.on('qr', (qr) => this._pushToLane(number, 'system', { type: 'QR', qr }))
            worker.on('ready', () => {
                this._pushToLane(number, 'system', { type: 'READY' })
                this.emit('account_ready', { number })
            })
            worker.on('error', (err) => this._pushToLane(number, 'system', { type: 'ERROR', error: err.message }))
            worker.on('disconnected', () => {
                this.workers.delete(number)
                this._pushToLane(number, 'system', { type: 'DISCONNECTED' })
            })

            worker.on('message_received', (data) => {
                this._handleIncomingMessage(number, data)
                this._pushToLane(number, 'system', { type: 'MESSAGE_RECEIVED', ...data });
            })

            worker.on('bot_simulation', (data) => {
                this._pushToLane(number, 'system', {
                    type: 'BOT_ACTIVITY',
                    time: new Date().toLocaleTimeString(),
                    action: data.action,
                    details: data.details
                })
            })

            worker.on('group_stream', (data) => {
                this._pushToLane(number, 'discovery', data.groups || []);
            });

            worker.on('discovery:complete', (data) => {
                this._pushToLane(number, 'system', { type: 'DISCOVERY_COMPLETE', groups: data.groups });
            })

            worker.on('metadata_batch', (data) => {
                this._pushToLane(number, 'discovery', data.updates || [])
            });

            worker.on('metadata_complete', (data) => {
                this._pushToLane(number, 'system', { type: 'METADATA_COMPLETE' });
            })

            worker.on('progress', (payload) => {
                if (payload.contacts) this._pushToLane(number, 'turbo', payload.contacts)
                if (payload.progress) this._pushToLane(number, 'pulse', payload.progress)
            });

            worker.on('extraction_complete', (data) => {
                this._pushToLane(number, 'system', { type: 'EXTRACTION_COMPLETE', contacts: data.contacts });
                this.syncAccountState(number);
            })

            worker.on('message_ack', (payload) => {
                const ledgerEntry = [...this.outboundLedger.values()].find(e => e.lastMessageId === payload.messageId)
                this.recordAckEvent({
                    messageId: payload.messageId,
                    ackState: payload.ackState,
                    timestampSent: ledgerEntry?.timestamp
                }).catch(() => { })
                this._pushToLane(number, 'system', { type: 'MESSAGE_ACK', ...payload });
            })

            worker.initialize().catch(err => {
                this._pushToLane(number, 'system', { type: 'ERROR', error: `Init failed: ${err.message}` });
            })
        } catch (err) {
            this.workers.delete(number)
            this._pushToLane(number, 'system', { type: 'ERROR', error: err.message });
        }
    }

    async _ensureWriterReady(worker) {
        if (worker.isReady) return
        return new Promise((resolve, reject) => {
            if (worker.isReady) return resolve()
            const onReady = () => { cleanup(); resolve() }
            const onError = (err) => { cleanup(); reject(err) }
            const cleanup = () => { worker.off('ready', onReady); worker.off('error', onError) }
            worker.once('ready', onReady); worker.once('error', onError)
            setTimeout(() => { cleanup(); reject(new Error('Timeout')) }, 180000)
        })
    }

    async getGroups(number) {
        const worker = this.workers.get(number)
        if (!worker) throw new Error(`Worker not found for ${number}`)
        await this._ensureWriterReady(worker)

        // Phase 1: Snapshot Discovery
        const groups = await worker.getGroups()

        // Phase 2: Sequential Metadata (Waterfall)
        // We start this in background so UI remains responsive as numbers fill in
        worker._countMetadata().catch(() => { })

        return groups
    }

    toggleSelection(number, groupId, isSelected) {
        const pipe = this._ensurePipeline(number);
        if (isSelected) pipe.selection.add(groupId);
        else pipe.selection.delete(groupId);
        this.syncAccountState(number);
    }

    selectAllGroups(number, isAll) {
        const worker = this.workers.get(number);
        if (!worker) return;
        const groups = worker.getGroupCache();
        const pipe = this._ensurePipeline(number);

        if (isAll) {
            groups.forEach(g => pipe.selection.add(g.id));
        } else {
            pipe.selection.clear();
        }
        this.syncAccountState(number);
    }

    getSelectedGroups(number) {
        const pipe = this.pipelines.get(number);
        return pipe ? Array.from(pipe.selection) : [];
    }

    async extractGroups(number, groupIds, options = {}) {
        const worker = this.workers.get(number)
        if (!worker) throw new Error(`Worker not found for ${number}`)
        await this._ensureWriterReady(worker)
        worker.extractionState.phase = 'EXTRACTING'
        worker.isCancelled = false
        const { onProgress } = options
        const allContacts = []
        let i = 0
        try {
            let totalGroups = groupIds.length;
            let currentGroupIndex = 0;

            const BATCH_SIZE = 1; // TITAN: Serial group processing for cleaner progress reporting
            for (let j = 0; j < groupIds.length; j++) {
                if (worker.isCancelled) break;
                const groupId = groupIds[j];
                currentGroupIndex = j + 1;

                // Emit telemetry pulse for Group Progress
                this._pushToLane(number, 'pulse', {
                    groupIndex: currentGroupIndex,
                    groupTotal: totalGroups,
                    phase: 'EXTRACTING'
                });

                const savedState = this.registry.getExtractionState(number);
                let resumeFrom = 0;
                if (savedState && savedState.groupId === groupId) resumeFrom = savedState.processedCount;

                const contacts = await worker.extractGroupContacts(groupId, { resumeFrom });
                allContacts.push(...contacts);
            }
            // Removed: this.registry.consume(number, allContacts.length)
            this.emit('extraction:complete', { number, contacts: allContacts, contactCount: allContacts.length })
            this._pushToLane(number, 'system', { type: 'EXTRACTION_COMPLETE', contacts: allContacts });
            this.syncAccountState(number);
            return allContacts
        } catch (err) {
            this.registry.saveExtractionState(number, { groupIds, processedGroups: i, totalContacts: allContacts.length, timestamp: Date.now(), error: err.message })
            throw err
        } finally { worker.extractionState.phase = 'COMPLETED' }
    }

    async closeAccount(number) {
        const worker = this.workers.get(number)
        if (worker) { await worker.close(); this.workers.delete(number) }
    }

    async closeAll() {
        for (const [number, worker] of this.workers) { try { await worker.close() } catch (e) { } }
        this.workers.clear()
    }

    stopAllCampaigns() {
        for (const worker of this.workers.values()) worker.isCancelled = true
    }

    async runCampaignForNumber(number, campaignId, options = {}) {
        const worker = this.workers.get(number)
        if (!worker) return
        await this._ensureWriterReady(worker)
        const queue = this.campaignManager.getQueue(campaignId, number)
        if (!queue) return
        const { delayMin = 60, delayMax = 120, variants = ["Hi"], sleepThreshold = 0, sleepDuration = 0 } = options
        let sent = queue.sent || 0; let failed = queue.failed || 0
        let sessionSent = 0 // Track messages sent in this specific session
        worker.isCancelled = false
        try {
            for (let i = 0; i < queue.contacts.length; i++) {
                while (this.isPaused && !worker.isCancelled) await worker._delay(2000)
                const c = queue.contacts[i]
                if (c.status === 'SENT' || c.status === 'FAILED') continue
                if (worker.isCancelled) break

                // 🚀 TITAN: SLEEP MODE LOGIC
                if (sleepThreshold > 0 && sleepDuration > 0 && sessionSent > 0 && sessionSent % sleepThreshold === 0) {
                    const sleepSec = sleepDuration * 60
                    console.log(`[MANAGER] 😴 Sleep Mode Active: Pausing for ${sleepDuration} minutes...`)
                    this.emit('campaign:status', { campaignId, status: 'WAITING', details: `Sleep Mode: ${sleepDuration}m`, duration: sleepSec })
                    
                    let remainingSleepMs = sleepSec * 1000
                    while (remainingSleepMs > 0 && !worker.isCancelled) {
                        while (this.isPaused && !worker.isCancelled) await new Promise(r => setTimeout(r, 1000))
                        await new Promise(r => setTimeout(r, 1000)); remainingSleepMs -= 1000
                    }
                    if (worker.isCancelled) break
                    console.log(`[MANAGER] 🌅 Sleep Mode Over: Resuming...`)
                }

                let variantIdx = (options.variantIndex === undefined || options.variantIndex === 'auto') ? (i % variants.length) : parseInt(options.variantIndex)
                let message = (variants[variantIdx] || variants[0]).replace(/{name}/gi, (c.name && c.name !== 'Manual Lead') ? c.name : "there")
                const jid = c.phone.includes('@') ? c.phone : `${c.phone}@c.us`
                const sendMode = options.mediaSendMode || 'combined'
                let result = { success: false }
                try {
                    if (sendMode === 'text_only' || !options.attachedMedia) result = await worker.sendMessage(jid, message, null)
                    else if (sendMode === 'combined') result = await worker.sendMessage(jid, message, options.attachedMedia)
                    else if (sendMode === 'media_first') {
                        const mediaRes = await worker.sendMessage(jid, null, options.attachedMedia)
                        if (mediaRes.success) { await worker._delay(1500); result = await worker.sendMessage(jid, message, null) }
                        else result = mediaRes
                    } else if (sendMode === 'text_first') {
                        const textRes = await worker.sendMessage(jid, message, null)
                        if (textRes.success) { await worker._delay(1500); result = await worker.sendMessage(jid, null, options.attachedMedia) }
                        else result = textRes
                    }
                } catch (err) {
                    const msg = (err.message || '').toLowerCase()
                    if (msg.includes('protocol') || msg.includes('timeout') || msg.includes('disconnected')) {
                        this.pauseAll(); i--; continue
                    }
                    result = { success: false, error: err.message }
                }
                if (result.success) {
                    c.status = 'SENT'; sent++; sessionSent++;
                    this.outboundLedger.set(jid, {
                        campaignId,
                        variantIdx,
                        timestamp: Date.now(),
                        repliesSent: 0,
                        hasReplied: false,
                        triggeredRules: [],
                        humanInterrupted: false,
                        lastMessageId: result.messageId
                    })
                    this.recordOutreachStrike({
                        messageId: result.messageId,
                        accountId: number,
                        recipientId: jid
                    }).catch(() => { })
                    this._saveLedger()
                    this.campaignManager.incrementVariantSent(campaignId, variantIdx)

                    // --- HEALTH: Deduct trust per message ---
                    this.registry.addTrust(number, -0.04)
                    this._checkHealthAlert(number, campaignId)
                } else { c.status = 'FAILED'; failed++ }
                this.campaignManager.updateQueueProgress(campaignId, number, { sent, failed, contacts: queue.contacts, status: worker.isCancelled ? 'CANCELLED' : (sent + failed >= queue.total ? 'COMPLETE' : 'RUNNING') })
                if (i < queue.contacts.length - 1 && !worker.isCancelled) {
                    let dMin = Number(delayMin); let dMax = Number(delayMax)
                    if (isNaN(dMin) || dMin < 10) dMin = 10; if (isNaN(dMax) || dMax < dMin + 20) dMax = dMin + 20 
                    if (dMin > dMax) [dMin, dMax] = [dMax, dMin]
                    const randomSec = Math.floor(Math.random() * (dMax - dMin + 1)) + dMin
                    this.emit('campaign:status', { campaignId, status: 'WAITING', details: `Delay: ${randomSec}s`, duration: randomSec })
                    let remainingMs = randomSec * 1000
                    while (remainingMs > 0 && !worker.isCancelled) {
                        while (this.isPaused && !worker.isCancelled) await new Promise(r => setTimeout(r, 500))
                        await new Promise(r => setTimeout(r, 100)); remainingMs -= 100
                    }
                }
            }
        } catch (err) { }
        // Removed: this.registry.consume(number, sent) - Now handled per-message in Worker

    }

    async _handleIncomingMessage(workerNumber, { from, body, fromMe, isBot, timestamp }) {
        const worker = this.workers.get(workerNumber)
        if (!worker) return
        let lead = this.outboundLedger.get(from)
        if (!lead) {
            const normJid = from.split('@')[0]
            for (const [k, v] of this.outboundLedger.entries()) { if (k.startsWith(normJid)) { lead = v; break; } }
        }
        if (!lead || (Date.now() - lead.timestamp > 48 * 60 * 60 * 1000)) return

        if (fromMe) {
            if (isBot) return
            lead.humanInterrupted = true; this._saveLedger()
            return
        }

        // TITAN: If this incoming message was flagged as a Bot (e.g., instant reply), STOP processing
        if (isBot) return

        if (this.workers.has(from.split('@')[0])) return
        const workerOverride = this.workerAutoReplyOverrides.get(workerNumber)
        let isAutoReplyEnabled = (workerOverride && typeof workerOverride.autoReply === 'boolean') ? workerOverride.autoReply : this.autoReplySettings.enabled
        if (lead.humanInterrupted) return
        const cleanBody = (body || '').toLowerCase().trim()
        if (!cleanBody) return
        if (!lead.hasReplied) {
            const nowSeconds = Math.floor(Date.now() / 1000)
            if (timestamp && (nowSeconds - timestamp > 60)) return
            lead.hasReplied = true
            if (lead.lastMessageId) {
                this.survivability.updateEvent(lead.lastMessageId, { reply_received: true }).catch(() => { })
            }
            this.campaignManager.incrementVariantReply(lead.campaignId, lead.variantIdx, workerNumber)

            // --- HEALTH: Real human reply boosts trust ---
            this.registry.addTrust(workerNumber, 0.25)
            this._checkHealthAlert(workerNumber, lead.campaignId)

            // TITAN: Capture and display the FIRST reply in the Guardian log
            this._pushToLane(workerNumber, 'system', {
                type: 'BOT_ACTIVITY',
                time: new Date().toLocaleTimeString(),
                lead: lead.phone || from.split('@')[0],
                action: 'CONVERSION',
                details: `[Lead First Reply] ${body.substring(0, 70)}${body.length > 70 ? '...' : ''}`
            });

            this._saveLedger()
        }
        if (!isAutoReplyEnabled) return
        for (const [idx, rule] of this.autoReplySettings.rules.entries()) {
            if (!rule.keyword || !rule.response || (lead.triggeredRules && lead.triggeredRules.includes(idx))) continue
            const keywords = rule.keyword.split(',').map(k => k.trim().toLowerCase()).filter(k => k)
            const isMatch = rule.mode === 'exact' ? keywords.some(k => cleanBody === k) : keywords.some(k => cleanBody.includes(k))
            if (isMatch && lead.repliesSent < 5) {
                lead.repliesSent++; if (!lead.triggeredRules) lead.triggeredRules = []
                lead.triggeredRules.push(idx); worker.dispatchHumanReply(from, rule.response)
                this._saveLedger(); break
            }
        }
    }

    _checkHealthAlert(number, campaignId) {
        const score = this.registry.getTrustScore(number)
        if (!this._healthAlertState) this._healthAlertState = new Map()
        const lastAlert = this._healthAlertState.get(number) || 100

        let suggestedDelay = null
        let tier = null

        if (score < 40 && lastAlert >= 40) {
            suggestedDelay = 300; tier = 'critical'
        } else if (score < 60 && lastAlert >= 60) {
            suggestedDelay = 120; tier = 'warning'
        } else if (score < 80 && lastAlert >= 80) {
            suggestedDelay = 60; tier = 'caution'
        }

        if (tier) {
            this._healthAlertState.set(number, score)
            this.emit('health:alert', {
                number,
                campaignId,
                trustScore: Math.round(score * 100) / 100,
                tier,
                suggestedDelay,
                message: `Account ${number} health is ${score.toFixed(1)}%. Suggested minimum delay: ${suggestedDelay}s.`
            })
            console.log(`[HEALTH] ⚠️ Account ${number} dropped to ${score.toFixed(1)}% (${tier}). Suggesting ${suggestedDelay}s delay.`)
        }
    }
}

module.exports = ExtractionManager
