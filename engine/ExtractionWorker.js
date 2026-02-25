const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

/**
 * ExtractionWorker is the automation unit for a single WhatsApp account.
 * It manages the Puppeteer instance and handles messaging, group scanning, and auto-replies.
 */
class ExtractionWorker extends EventEmitter {
    constructor({ number, sessionPath, registry }) {
        super();
        this.number = number;
        this.sessionPath = sessionPath;
        this.registry = registry;

        this.client = null;
        this.isReady = false;
        this.isCancelled = false;

        this._groupCache = [];
        this._contactsCache = [];
        this._contactsKeySet = new Set();

        this.autoReplySettings = {
            enabled: false,
            rules: []
        };

        this.extractionState = {
            phase: 'IDLE',
            discoveredGroups: [],
            metadataProgress: 0,
            totalGroups: 0
        };

        this._lastResponseTimes = new Map();
        this._pendingReplies = new Map();
        this._botStartTime = Math.floor(Date.now() / 1000);
        this._isOccupied = false;
        this._lastSimFinishedAt = 0;
        this._botSentBuffer = new Set();
    }

    /**
     * Updates auto-reply configuration for this worker.
     */
    setAutoReplySettings(settings) {
        this.autoReplySettings = settings;
        console.log(`[WORKER-${this.number}] Auto-Reply config synced.`);
    }

    /**
     * Reports current cache sizes to the central registry.
     */
    _triggerRegistrySync() {
        if (this.registry) {
            this.registry.updateAccountCounts(this.number, this._groupCache.length, this._contactsCache.length);
        }
    }

    /**
     * Adds unique contacts to the local cache and triggers a sync.
     */
    appendContacts(contacts) {
        if (!Array.isArray(contacts)) return;

        let newCount = 0;
        for (const contact of contacts) {
            const key = `${contact.phone}|${contact.sourceGroupId}`;
            if (!this._contactsKeySet.has(key)) {
                this._contactsCache.push(contact);
                this._contactsKeySet.add(key);
                newCount++;
            }
        }

        if (newCount > 0) {
            this._triggerRegistrySync();
            console.log(`[WORKER-${this.number}] In-Memory Pulse: ${newCount} new contacts added (Total: ${this._contactsCache.length})`);
        }
    }

    /**
     * Resets the contact cache.
     */
    clearContactsCache() {
        this._contactsCache = [];
        this._contactsKeySet.clear();
        this._triggerRegistrySync();
    }

    /**
     * Resets the group cache.
     */
    clearGroupsCache() {
        this._groupCache = [];
        this.extractionState.discoveredGroups = [];
        this._triggerRegistrySync();
    }

    /**
     * Detects installed Chrome executable paths.
     */
    _findChrome() {
        const paths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
            path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
            path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe')
        ];

        for (const p of paths) {
            if (fs.existsSync(p)) {
                console.log(`[WORKER-${this.number}] Using System Chrome: ${p}`);
                return p;
            }
        }
        return undefined;
    }

    /**
     * Launches the WhatsApp client and sets up event handlers.
     */
    async initialize() {
        console.log(`[WORKER-${this.number}] Initializing Titan Engine (Quantum Timing)...`);
        this._botStartTime = Math.floor(Date.now() / 1000);

        const chromePath = this._findChrome();

        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: `client_${this.number}`,
                dataPath: this.sessionPath
            }),
            webVersionCache: { type: 'none' },
            puppeteer: {
                executablePath: chromePath,
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--window-position=0,0',
                    '--window-size=650,750',
                    '--disable-blink-features=AutomationControlled'
                ],
                protocolTimeout: 3600000
            }
        });

        // Tab Management: Prevent duplicate WhatsApp tabs
        const tabManagerInterval = setInterval(async () => {
            try {
                if (this.client && this.client.pupBrowser) {
                    const pages = await this.client.pupBrowser.pages().catch(() => []);
                    if (pages.length > 1) {
                        const target = this.client.pupPage || pages.find(p => p.url().includes('web.whatsapp.com')) || pages[0];
                        for (const page of pages) {
                            if (page !== target && !page.isClosed()) {
                                await page.close().catch(() => { });
                            }
                        }
                        if (target) await target.bringToFront().catch(() => { });
                    }
                }
            } catch (e) { }
        }, 5000);

        setTimeout(() => clearInterval(tabManagerInterval), 60000);

        // Core Event Handlers
        this.client.on('qr', qr => this.emit('qr', qr));

        this.client.on('authenticated', () => {
            console.log(`[WORKER-${this.number}] Authenticated. Booting context...`);
            this._setupInternalHooks();
        });

        this.client.on('ready', () => {
            this.isReady = true;
            console.log(`[WORKER-${this.number}] ✅ TITAN QUANTUM READY`);
            this.emit('ready');
            this._setupInternalHooks(); // Just in case
        });

        this.client.on('disconnected', () => {
            this.isReady = false;
            this.emit('disconnected');
        });

        this.client.on('message_ack', (msg, ack) => {
            this.emit('message_ack', {
                messageId: msg.id._serialized || msg.id,
                recipientId: msg.to,
                ackState: ack,
                timestamp: Date.now()
            });
        });

        this.client.on('message', async msg => {
            let from = msg.from;
            // Handle LID resolution
            if (from.endsWith('@lid')) {
                try {
                    const contact = await msg.getContact();
                    if (contact && contact.number) {
                        from = `${contact.number}@c.us`;
                    }
                } catch (err) {
                    console.error('[WORKER] LID Resolve Failed:', err.message);
                }
            }

            const payload = {
                from: from,
                body: msg.body,
                fromMe: msg.fromMe,
                timestamp: msg.timestamp
            };

            this._handleIncomingMessage(payload);
        });

        await this.client.initialize().catch(err => {
            this.emit('error', err);
        });
    }

    /**
     * Injects custom scripts and bridge functions into the browser context.
     */
    async _setupInternalHooks() {
        if (!this.client || !this.client.pupPage) return;

        try {
            // Expose a signal function for the browser to communicate events back to Node
            await this.client.pupPage.exposeFunction('titanSignal', payload => this._handleIncomingMessage(payload)).catch(() => { });

            // Bridge for chunked group discovery
            await this.client.pupPage.exposeFunction('onGroupChunk', groups => {
                if (groups && groups.length > 0) {
                    const isCompletionSignal = groups.length === 1 && groups[0].isComplete;
                    if (!isCompletionSignal) {
                        this._groupCache.push(...groups);
                    }
                    this.emit('group_stream', { number: this.number, groups: groups });
                }
            }).catch(() => { });

            // Injection script for DOM/Store monitoring
            const injection = () => {
                const setupHooks = () => {
                    if (!window.Store || !window.Store.Chat) {
                        // Attempt to find modules manually if Store isn't ready
                        try {
                            const chatModule = window.mR ? window.mR.findModule('Chat') : null;
                            if (chatModule && !window.Store) window.Store = { Chat: chatModule };
                        } catch (e) { }
                    }

                    if (window.Store && window.Store.Msg && !window.WWebISHooked) {
                        window.WWebISHooked = true;
                        window.Store.Msg.on('add', (msg) => {
                            try {
                                const m = Array.isArray(msg) ? msg[0] : msg;
                                if (m && m.isNewMsg && m.id) {
                                    const body = (m.body || m.caption || '').trim();
                                    const payload = {
                                        from: m.id.remote?._serialized || m.id.remote,
                                        body: body,
                                        fromMe: !!m.id.fromMe,
                                        timestamp: m.t
                                    };
                                    window.titanSignal(payload);
                                }
                            } catch (e) { }
                        });
                        console.log('--- TITAN QUANTUM CONTEXT HOOKED ---');
                    }

                    // Unread suppressors
                    if (window.Store && window.Store.Chat && window.Store.Chat.models) {
                        window.Store.Chat.models.forEach(chat => {
                            if (chat && !chat.markUnread) chat.markUnread = () => { };
                            if (chat && !chat.sendUnread) chat.sendUnread = () => { };
                        });
                    }
                };

                setInterval(setupHooks, 2000);
                setupHooks();
            };

            await this.client.pupPage.evaluateOnNewDocument(injection);
            await this.client.pupPage.evaluate(injection).catch(() => { });

            await this._vaccinateStore();
        } catch (err) { }
    }

    /**
     * Prevents common errors in WWebJS store methods by wrapping them.
     */
    async _vaccinateStore() {
        try {
            await this.client.pupPage.evaluate(() => {
                if (window.WWebJS && window.WWebJS.sendSeen) {
                    const original = window.WWebJS.sendSeen;
                    window.WWebJS.sendSeen = async function (jid) {
                        try { return await original(jid); } catch (e) { return { success: true }; }
                    };
                }
            });
        } catch (e) { }
    }

    /**
     * Internal handler for incoming messages from either the Client or the Titian Hook.
     */
    _handleIncomingMessage(payload) {
        const { from, body, fromMe, timestamp } = payload;

        let isBot = false;
        if (fromMe && this._botSentBuffer.has(body)) {
            isBot = true;
            this._botSentBuffer.delete(body);
        }

        if (body) {
            this.emit('message_received', {
                from,
                body,
                fromMe,
                isBot,
                number: this.number,
                timestamp
            });
        }

        // Auto-reply logic trigger
        if (!fromMe && this.autoReplySettings.enabled && timestamp >= this._botStartTime) {
            if (from && (from.includes('broadcast') || from.includes('status'))) return;
            // The actual rule matching happens in ExtractionManager. 
            // We just notify that a candidate for reply arrived.
        }
    }

    /**
     * Safe wrapper for page.evaluate with retries for detached frame errors.
     */
    async _safeEvaluate(fn, ...args) {
        let retries = 3;
        while (retries > 0) {
            try {
                if (!this.client.pupPage || this.client.pupPage.isClosed()) {
                    if (this.client.pupBrowser) {
                        const pages = await this.client.pupBrowser.pages();
                        this.client.pupPage = pages.find(p => p.url().includes('web.whatsapp.com')) || pages[0];
                    }
                }
                return await this.client.pupPage.evaluate(fn, ...args);
            } catch (err) {
                if (err.message.includes('detached') || err.message.includes('Session closed')) {
                    console.warn(`[WORKER] Detached Frame / Session error. Retrying... (${retries})`);
                    retries--;
                    await new Promise(r => setTimeout(r, 1500));
                } else {
                    throw err;
                }
            }
        }
        throw new Error('Browser Error: Failed after retries (Detached Frame)');
    }

    /**
     * Fetches groups from the WhatsApp Web database.
     */
    async getGroups() {
        if (!this.isReady) throw new Error('Client not ready');

        try {
            const groups = await this._safeEvaluate(async () => {
                if (!window.Store || !window.Store.Chat) return [];

                let chats = [];
                if (window.Store.Chat.getModelsArray) chats = window.Store.Chat.getModelsArray();
                else if (window.Store.Chat.models) chats = window.Store.Chat.models;

                const groupList = [];
                for (const chat of chats) {
                    const id = chat.id?._serialized || chat.id;
                    if (id && typeof id === 'string' && id.endsWith('@g.us')) {
                        let count = 0;
                        const metadata = window.Store.GroupMetadata ? window.Store.GroupMetadata.get(id) : null;
                        if (metadata && metadata.participants) {
                            count = metadata.participants.length;
                        } else {
                            count = -1; // Unknown
                        }

                        groupList.push({
                            id: id,
                            name: chat.name || chat.formattedTitle || 'Unnamed Group',
                            participantCount: count,
                            isLimited: !!chat.isReadOnly
                        });
                    }
                }
                return groupList;
            });

            this._groupCache = groups;

            // Emit in chunks to avoid IPC bottleneck
            const chunkSize = 500;
            for (let i = 0; i < groups.length; i += chunkSize) {
                this.emit('group_stream', { number: this.number, groups: groups.slice(i, i + chunkSize) });
            }

            this.emit('group_stream', { number: this.number, groups: [{ isComplete: true }] });
            this._triggerRegistrySync();
            return groups;
        } catch (err) {
            console.error(`[WORKER-${this.number}] ❌ getGroups Error:`, err.message);
            return [];
        }
    }

    /**
     * Background task to fetch participant metadata for groups that have unknown/0 counts.
     */
    async _countMetadata() {
        if (!this.isReady) return;

        try {
            this.extractionState.phase = 'COUNTING';
            const targets = this._groupCache.filter(g => !g.participantCount || g.participantCount <= 0);

            if (targets.length === 0) {
                this.extractionState.phase = 'COMPLETED';
                return;
            }

            console.log(`[WORKER-${this.number}] ⚡ Pipeline B: Fetching metadata for ${targets.length} groups...`);
            this.extractionState.totalGroups = this._groupCache.length;

            const batchSize = 100;
            for (let i = 0; i < targets.length; i += batchSize) {
                if (this.isCancelled) break;

                const batch = targets.slice(i, i + batchSize).map(g => g.id);
                const updates = await this.client.pupPage.evaluate(async ids => {
                    const results = [];
                    for (const id of ids) {
                        try {
                            const metadata = await window.Store.GroupMetadata.find(id);
                            results.push({
                                id: id,
                                participantCount: metadata?.participants ? metadata.participants.length : 0,
                                isLimited: !!window.Store.Chat.get(id)?.isReadOnly
                            });
                        } catch (e) {
                            results.push({ id, participantCount: 0 });
                        }
                    }
                    return results;
                }, batch);

                for (const update of updates) {
                    const group = this._groupCache.find(g => g.id === update.id);
                    if (group) {
                        group.participantCount = update.participantCount;
                        this.emit('metadata_update', {
                            number: this.number,
                            groupId: update.id,
                            participantCount: update.participantCount
                        });
                    }
                }

                this.extractionState.metadataProgress = (this._groupCache.length - targets.length) + i + updates.length;
            }

            this.extractionState.phase = 'COMPLETED';
        } catch (err) {
            console.error(`[WORKER-${this.number}] Pipeline B Exception:`, err.message);
            this.extractionState.phase = 'COMPLETED';
        }
    }

    /**
     * Scrapes participants from a specific group.
     */
    async extractGroupContacts(groupId, options = {}) {
        if (!this.isReady) throw new Error('Client not ready');

        const { onProgress, resumeFrom = 0 } = options;

        try {
            const data = await this._safeEvaluate(async jid => {
                if (!window.Store || !window.Store.Chat || !window.Store.Contact) {
                    throw new Error('Required Store modules missing.');
                }
                const chat = window.Store.Chat.get(jid);
                if (!chat) throw new Error('Chat not found for group: ' + jid);

                let participants = [];
                const metadata = window.Store.GroupMetadata ? window.Store.GroupMetadata.get(jid) : null;
                if (metadata && metadata.participants) {
                    participants = metadata.participants;
                } else {
                    // Try fetch
                    await window.Store.GroupMetadata.find(jid).catch(() => { });
                    participants = (window.Store.GroupMetadata.get(jid))?.participants || [];
                }

                const contacts = participants.map(p => {
                    const contactId = typeof p.id === 'object' ? p.id._serialized : p.id;
                    const contact = window.Store.Contact.get(contactId) || p.contact;

                    let phone = contact?.phoneNumber || contact?.userid || p.id.user || p.id;
                    let name = contact?.name || contact?.pushname || contact?.formattedName || '';

                    return {
                        user: String(phone),
                        isAdmin: !!(p.isAdmin || p.isSuperAdmin),
                        name: name,
                        groupName: chat.name || chat.formattedTitle || ''
                    };
                });

                return {
                    name: chat.name || chat.formattedTitle || '',
                    participants: contacts
                };
            }, groupId);

            if (!data || !data.participants) return [];

            const extracted = [];
            const seen = new Set();
            const sourceParticipants = data.participants;

            for (let i = resumeFrom; i < sourceParticipants.length; i++) {
                if (this.isCancelled) return extracted;

                const p = sourceParticipants[i];
                if (!p.user || seen.has(p.user) || p.user.length >= 15) continue;
                seen.add(p.user);

                extracted.push({
                    phone: p.user,
                    name: p.name,
                    groupSource: data.name,
                    sourceGroupId: groupId,
                    isAdmin: p.isAdmin
                });

                // Batch checkpoint and reporting
                if ((i + 1) % 50 === 0) {
                    this.extractionState.currentExtraction = {
                        groupId,
                        processedCount: i + 1,
                        totalCount: sourceParticipants.length,
                        timestamp: Date.now()
                    };
                    if (this.registry) {
                        this.registry.updateExtractionState(this.number, this.extractionState.currentExtraction);
                    }
                    if (onProgress) {
                        onProgress({
                            processed: i + 1,
                            total: sourceParticipants.length,
                            contactCount: extracted.length
                        });
                    }
                }
            }

            if (this.registry) this.registry.clearExtractionState(this.number);
            return extracted;
        } catch (err) {
            console.error(`[WORKER-${this.number}] extractGroupContacts error:`, err.message);
            throw err;
        }
    }

    /**
     * Sends a message with safety delays and optional media.
     */
    async sendMessage(chatId, body, mediaPath = null, isSimulated = false) {
        if (!this.isReady) throw new Error(`Worker ${this.number} not ready`);

        // Wait if busy unless this is a simulated sub-step
        if (!isSimulated) {
            while (this._isOccupied) {
                await this._delay(1000 + Math.random() * 2000);
            }
            this._isOccupied = true;
        }

        // Adaptive Atomic Gap Enforcement
        const now = Date.now();
        const gap = now - this._lastSimFinishedAt;
        const requiredGap = Math.floor(Math.random() * 20000 + 10000); // 10-30s gap

        if (gap < requiredGap) {
            const wait = requiredGap - gap;
            console.log(`[WORKER-${this.number}] ⏳ Atomic Gap Enforcement: Waiting ${Math.round(wait / 1000)}s...`);
            await this._delay(wait);
        }

        const cleanBody = (body || '').trim();
        if (cleanBody) this._botSentBuffer.add(cleanBody);

        try {
            let message;
            if (mediaPath && fs.existsSync(mediaPath)) {
                const media = MessageMedia.fromFilePath(mediaPath);
                message = await this.client.sendMessage(chatId, media, {
                    caption: cleanBody || null,
                    sendMediaAsDocument: false,
                    unsafeMime: true
                });
            } else {
                message = await this.client.sendMessage(chatId, body || ' ');
            }

            const messageId = message?.id?._serialized;
            this._lastSimFinishedAt = Date.now();
            if (!isSimulated) this._isOccupied = false;

            // Track response window for bot-loop detection
            this._lastResponseTimes.set(chatId, Math.floor(Date.now() / 1000));

            return { success: true, messageId: messageId };
        } catch (err) {
            if (!isSimulated) this._isOccupied = false;
            // Fallback to surgical send if standard method fails
            return await this._surgicalSendMessage(chatId, body, mediaPath);
        }
    }

    /**
     * Directly interacts with the browser's window.Store to send messages (fallback).
     */
    async _surgicalSendMessage(chatId, body, mediaPath = null) {
        try {
            if (!this.client || !this.client.pupPage || this.client.pupPage.isClosed()) {
                return { success: false, error: 'Session lost' };
            }

            return await this.client.pupPage.evaluate(async (jid, text) => {
                try {
                    if (!window.Store || !window.Store.Chat) throw new Error('Store not ready');
                    let chat = window.Store.Chat.get(jid);
                    if (!chat) chat = await window.Store.Chat.find(jid);
                    if (!chat) throw new Error('Chat not found');

                    if (window.WWebJS && window.WWebJS.sendMessage) {
                        await window.WWebJS.sendMessage(chat, text);
                        return { success: true };
                    }

                    if (window.Store.SendMessage && window.Store.SendMessage.sendMsgToChat) {
                        await window.Store.SendMessage.sendMsgToChat(chat, text);
                        return { success: true };
                    }

                    if (chat.sendMessage) {
                        await chat.sendMessage(text);
                        return { success: true };
                    }

                    throw new Error('No send method found');
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }, chatId, body);

        } catch (err) {
            console.error(`[WORKER-${this.number}] ❌ Surgical Send Crash:`, err.message);
            return { success: false, error: 'SURGICAL_CRASH: ' + err.message };
        }
    }

    /**
     * Schedules and executes a "biological" human-like auto-reply.
     */
    async dispatchHumanReply(jid, responseText) {
        if (this._pendingReplies.has(jid)) return;

        const minDelay = 15000;
        const maxDelay = 300000;
        const scheduledDelay = Math.floor(Math.random() * (maxDelay - minDelay) + minDelay);

        console.log(`[WORKER-${this.number}] 🛡️ Guardian Strike Scheduled for ${jid} in ${Math.round(scheduledDelay / 1000)}s`);

        const timer = setTimeout(async () => {
            try {
                // Wait if bot is occupied with outreach
                while (this._isOccupied) {
                    await this._delay(2000 + Math.random() * 3000);
                }
                this._isOccupied = true;

                this.emit('bot_simulation', { jid, action: 'matching', details: 'Entering chat context...' });

                // Simulate "Read"
                try {
                    await this.client.sendSeen(jid);
                    console.log(`[WORKER-${this.number}] 👀 Lead ${jid} marked as SEEN`);
                } catch (e) { }

                await this._delay(1500 + Math.random() * 2000);

                // Personalize name if tag exists
                let finalResponse = responseText;
                try {
                    const contact = await this.client.getContactById(jid).catch(() => null);
                    const name = contact ? (contact.pushname || contact.name) : '';
                    finalResponse = responseText.replace(/{name}/gi, name || 'there');
                } catch (e) { }

                // Simulate "Typing"
                const typingTime = Math.min(Math.max((finalResponse.length / 15) * 1000, 3000), 12000);
                this.emit('bot_simulation', { jid, action: 'typing', details: `Typing response (${Math.round(typingTime / 1000)}s)...` });

                try {
                    const chat = await this.client.getChatById(jid);
                    await chat.sendStateTyping();
                } catch (e) { }

                await this._delay(typingTime);

                this.emit('bot_simulation', { jid, action: 'sent', details: 'Dispatching strike now.' });

                const res = await this.sendMessage(jid, finalResponse, null, true);
                if (res.success) {
                    console.log(`[WORKER-${this.number}] ✅ Biological Auto-Reply SENT after ${Math.round(scheduledDelay / 1000)}s wait.`);
                }
            } catch (err) {
                console.error(`[WORKER-${this.number}] ❌ Biological Simulation Failed:`, err.message);
            } finally {
                this._isOccupied = false;
                this._lastSimFinishedAt = Date.now();
                this._pendingReplies.delete(jid);
            }
        }, scheduledDelay);

        this._pendingReplies.set(jid, timer);
    }

    /**
     * Utility delay function.
     */
    _delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    /**
     * Stops the worker and closes the browser.
     */
    async close() {
        this.isCancelled = true;
        this.isReady = false;
        if (this.client) {
            try { await this.client.destroy(); } catch (e) { }
        }
    }

    getGroupCache() {
        return this._groupCache || [];
    }

    getContactsCache() {
        return this._contactsCache || [];
    }
}

module.exports = ExtractionWorker;