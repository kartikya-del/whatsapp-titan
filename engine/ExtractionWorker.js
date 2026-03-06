const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js')
const path = require('path')
const fs = require('fs')
const EventEmitter = require('events')

/**
 * DiscoveryScroller: Independent, non-blocking scrolling engine per worker.
 * Prevents UI freezes by using async yields and random-jittered movement.
 */
class DiscoveryScroller {
    constructor(page) {
        this.page = page;
        this.isScrolling = false;
    }

    async scrollTowards(selector, direction = 'down') {
        if (this.isScrolling || !this.page || this.page.isClosed()) return;
        this.isScrolling = true;
        try {
            await this.page.evaluate((sel, dir) => {
                const el = document.querySelector(sel);
                if (el) {
                    const amount = dir === 'down' ? 500 : -500;
                    el.scrollBy({ top: amount, behavior: 'smooth' });
                }
            }, selector, direction);
            // Non-blocking biological wait
            await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
        } catch (e) { }
        this.isScrolling = false;
    }
}

class ExtractionWorker extends EventEmitter {
    constructor({ number, sessionPath, registry }) {
        super()
        this.number = number
        this.sessionPath = sessionPath
        this.registry = registry
        this.client = null
        this.isReady = false
        this.isCancelled = false
        this._groupCache = []
        this.autoReplySettings = { enabled: false, rules: [] }
        this._watchdogActive = false

        this.scroller = null; // To be initialized in finalizeAndReady

        this._lastResponseTimes = new Map()
        this._pendingReplies = new Map()
        this._botStartTime = Math.floor(Date.now() / 1000)
        this._isOccupied = false
        this._lastSimFinishedAt = 0
        this._nextRequiredGap = 15000

        this.extractionState = {
            phase: 'IDLE',
            discoveredGroups: [],
            metadataProgress: 0,
            totalGroups: 0
        }
        this._botSentBuffer = new Set()
    }

    setAutoReplySettings(settings) {
        this.autoReplySettings = settings
        console.log(`[WORKER-${this.number}] Auto-Reply settings synced.`)
    }

    async initialize() {
        console.log(`[WORKER-${this.number}] Initializing Titan Engine (Quantum Timing)...`)
        this._botStartTime = Math.floor(Date.now() / 1000)

        const getChromePath = () => {
            const potential = [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
                path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
                path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe')
            ]
            for (const p of potential) {
                if (fs.existsSync(p)) return p
            }
            return undefined
        }

        const execPath = getChromePath()

        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: `client_${this.number}`,
                dataPath: this.sessionPath
            }),
            webVersionCache: { type: 'none' },
            puppeteer: {
                executablePath: execPath,
                headless: false,
                args: [
                    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                    '--no-first-run', '--no-default-browser-check', '--disable-gpu',
                    '--disable-software-rasterizer', '--window-position=0,0', '--window-size=650,750',
                    '--disable-blink-features=AutomationControlled'
                ],
                protocolTimeout: 3600000
            }
        })

        return new Promise((resolve, reject) => {
            const tabGuard = setInterval(async () => {
                try {
                    if (this.client && this.client.pupBrowser) {
                        const pages = await this.client.pupBrowser.pages().catch(() => []);
                        if (pages.length > 1) {
                            const mainPage = this.client.pupPage || pages.find(p => p.url().includes('web.whatsapp.com')) || pages[0];
                            if (mainPage) {
                                for (const p of pages) { if (p !== mainPage && !p.isClosed()) await p.close().catch(() => { }); }
                                try { await mainPage.bringToFront(); } catch (e) { }
                            }
                        }
                    }
                } catch (e) { }
            }, 2500);

            setTimeout(() => clearInterval(tabGuard), 60000);

            const handleIncoming = async (msgData) => {
                const { from, body, fromMe, timestamp } = msgData;
                let isBot = false;
                if (fromMe && this._botSentBuffer.has(body)) {
                    isBot = true;
                    this._botSentBuffer.delete(body);
                }
                if (body) {
                    this.emit('message_received', { from, body, fromMe, isBot, number: this.number })
                }
                if (fromMe || !this.autoReplySettings.enabled) return
                if (timestamp < this._botStartTime) return
                if (from && (from.includes('broadcast') || from.includes('status'))) return
            }

            this.client.on('message', (msg) => {
                handleIncoming({ from: msg.from, body: msg.body, fromMe: msg.fromMe, timestamp: msg.timestamp })
            })

            const finalizeAndReady = async () => {
                if (this.isReady) return
                try {
                    if (this.client.pupPage && !this.client.pupPage.isClosed()) {
                        this.scroller = new DiscoveryScroller(this.client.pupPage);
                        await this.client.pupPage.exposeFunction('titanSignal', (data) => handleIncoming(data)).catch(() => { })
                        await this.client.pupPage.exposeFunction('titanAckSignal', (data) => {
                            this.emit('message_ack', data)
                        }).catch(() => { })
                        const snifferScript = () => {
                            const setup = () => {
                                if (!window.Store || !window.Store.Chat) {
                                    try {
                                        const m = window.mR ? window.mR.findModule('Chat') : null;
                                        if (m && !window.Store) window.Store = { Chat: m };
                                    } catch (e) { }
                                }
                                if (window.Store && window.Store.Msg && !window._titanHooked) {
                                    window._titanHooked = true;
                                    window.Store.Msg.on('add', (msg) => {
                                        try {
                                            const m = Array.isArray(msg) ? msg[0] : msg;
                                            if (m && m.isNewMsg && m.id) {
                                                const body = (m.body || m.caption || '').trim();
                                                window.titanSignal({
                                                    messageId: m.id._serialized,
                                                    from: m.id.remote?._serialized || m.id.remote,
                                                    body: body,
                                                    fromMe: !!m.id.fromMe,
                                                    timestamp: m.t
                                                });
                                            }
                                        } catch (e) { }
                                    });
                                    window.Store.Msg.on('change:ack', (msg) => {
                                        try {
                                            if (msg && msg.id) {
                                                window.titanAckSignal({
                                                    messageId: msg.id._serialized,
                                                    ackState: msg.ack,
                                                    timestamp: Date.now()
                                                });
                                            }
                                        } catch (e) { }
                                    });
                                }
                                if (window.Store && window.Store.Chat && window.Store.Chat.models) {
                                    window.Store.Chat.models.forEach(c => {
                                        if (c && !c.markedUnread) c.markedUnread = () => { };
                                        if (c && !c.setPresence) c.setPresence = () => { };
                                    });
                                }
                            };
                            setInterval(setup, 2000); setup();
                        };
                        await this.client.pupPage.evaluateOnNewDocument(snifferScript);
                        await this.client.pupPage.evaluate(snifferScript).catch(() => { });
                    }
                    await this._ensureBridge(); await this._vaccinateStore()
                } catch (e) { }
                this.isReady = true; this.emit('ready'); resolve()
            }

            this.client.on('authenticated', () => finalizeAndReady())
            this.client.on('qr', (qr) => this.emit('qr', qr))
            this.client.on('ready', () => finalizeAndReady())
            this.client.on('disconnected', () => { this.isReady = false; this.emit('disconnected') })
            setTimeout(() => { if (!this.isReady) finalizeAndReady() }, 60000)
            this.client.initialize().catch(reject)
        })
    }

    async _ensureBridge(retry = 0) {
        if (!this.client || !this.client.pupPage) return
        try {
            const exists = await this.client.pupPage.evaluate(() => typeof window.onGroupChunk === 'function')
            if (exists) return
            await this.client.pupPage.exposeFunction('onGroupChunk', (groups) => {
                if (groups && groups.length > 0) {
                    if (!(groups.length === 1 && groups[0].isComplete)) this._groupCache.push(...groups)
                    this.emit('group_stream', { number: this.number, groups })
                }
            })
        } catch (e) {
            if (!e.message.includes('already been exposed') && retry < 3) {
                await new Promise(r => setTimeout(r, 500)); return this._ensureBridge(retry + 1)
            }
        }
    }

    async getGroups() {
        if (!this.isReady) throw new Error('Client not ready')
        this.isCancelled = false; // TITAN: Reset cancellation latch to allow re-sync after Clear All
        this.extractionState.phase = 'DISCOVERING'
        try {
            // Discrete Snapshot Logic (1.0.11)
            const discoveredGroups = await this.client.pupPage.evaluate(async () => {
                if (!window.Store || !window.Store.Chat) return [];
                let chats = [];
                if (window.Store.Chat.getModelsArray) chats = window.Store.Chat.getModelsArray();
                else if (window.Store.Chat.models) chats = window.Store.Chat.models;

                return chats
                    .filter(c => {
                        const gid = c.id?._serialized || c.id;
                        return gid && typeof gid === 'string' && gid.endsWith('@g.us');
                    })
                    .map(c => {
                        const gid = c.id?._serialized || c.id;
                        const chatObj = window.Store.Chat.get(gid);
                        let gName = chatObj?.name || chatObj?.formattedTitle || c.name || c.formattedTitle;
                        if (!gName && c.__x_name) gName = c.__x_name;
                        if (!gName && c.__x_formattedTitle) gName = c.__x_formattedTitle;
                        if (!gName && c.contact) gName = c.contact.name || c.contact.pushname;
                        if (!gName && window.Store.GroupMetadata) {
                            const gm = window.Store.GroupMetadata.get(gid);
                            if (gm && gm.subject) gName = gm.subject;
                        }

                        return {
                            id: gid,
                            name: gName || 'Unnamed Group',
                            participantCount: -1,
                            isLimited: !!c.isReadOnly
                        };
                    });
            });

            this._groupCache = discoveredGroups;

            // 1.0.11 Sequential Emit: Send the full snapshot once Discovery is done
            this.emit('discovery:complete', { number: this.number, groups: this._groupCache });

            return this._groupCache;
        } catch (err) {
            console.error(`[WORKER-${this.number}] Discovery Fail:`, err);
            return [];
        } finally {
            this.extractionState.phase = 'IDLE';
        }
    }

    async _countMetadata() {
        if (!this.isReady || this.extractionState.phase === 'EXTRACTING') return;

        this.extractionState.phase = 'COUNTING';
        const groups = this._groupCache;
        if (!groups || groups.length === 0) return;

        this.extractionState.totalGroups = groups.length;
        this.extractionState.metadataProgress = 0;

        const BATCH_SIZE = 500; // TITAN TURBO X: 500 Groups per pulse
        for (let i = 0; i < groups.length; i += BATCH_SIZE) {
            if (this.isCancelled || this.extractionState.phase !== 'COUNTING') break;

            const batch = groups.slice(i, i + BATCH_SIZE);
            const batchIds = batch.map(g => g.id);

            try {
                const results = await this.client.pupPage.evaluate(async (ids) => {
                    const results = [];
                    // TITAN CONCURRENCY: Process 50 groups in parallel to overlap network requests
                    const CONCURRENCY = 50;
                    for (let j = 0; j < ids.length; j += CONCURRENCY) {
                        const chunk = ids.slice(j, j + CONCURRENCY);
                        await Promise.allSettled(chunk.map(async (gid) => {
                            try {
                                let chat = window.Store.Chat.get(gid);
                                if (!chat) chat = await window.Store.Chat.find(gid).catch(() => null);

                                const getCount = (c) => {
                                    if (!c) return 0;
                                    let p = c.groupMetadata?.participants || window.Store.GroupMetadata?.get(gid)?.participants;
                                    if (!p) return 0;
                                    if (Array.isArray(p)) return p.length;
                                    if (typeof p.toArray === 'function') return p.toArray().length;
                                    if (p.models) return p.models.length;
                                    return p.length || 0;
                                };

                                let count = getCount(chat);

                                // If count is 0/1, force a deep fetch from server
                                if (count <= 1 && window.Store.GroupMetadata?.find) {
                                    await window.Store.GroupMetadata.find(gid).catch(() => { });
                                    count = getCount(chat);
                                }

                                // Hydrate name
                                let gName = chat?.name || chat?.formattedTitle;
                                if (!gName && window.Store.GroupMetadata) {
                                    const gm = window.Store.GroupMetadata.get(gid);
                                    if (gm && gm.subject) gName = gm.subject;
                                }

                                results.push({ id: gid, participantCount: count || 0, name: gName || null });
                            } catch (e) {
                                results.push({ id: gid, participantCount: 0 });
                            }
                        }));
                    }
                    return results;
                }, batchIds);

                const updates = [];
                results.forEach(res => {
                    const g = this._groupCache.find(x => x.id === res.id);
                    if (g) {
                        g.participantCount = res.participantCount;
                        if (res.name && g.name === 'Unnamed Group') {
                            g.name = res.name;
                        }
                        updates.push({ id: res.id, participantCount: res.participantCount, name: g.name });
                    }
                });

                this.emit('metadata_batch', { number: this.number, updates });
                this.extractionState.metadataProgress = i + results.length;

                // Targeted Scroller: Trigger lazy-load if ANY group is "cold"
                if (results.some(r => r.participantCount <= 1)) {
                    await this.scroller.scrollTowards('#pane-side', 'down');
                    await new Promise(r => setTimeout(r, 50));
                }

                await new Promise(r => setTimeout(r, 50)); // Turbo Batch Yield
            } catch (e) { }
        }
        this.extractionState.phase = 'IDLE';
        this.emit('metadata_complete', { number: this.number });
    }
    async _safeEvaluate(fn, ...args) {
        let retries = 3;
        while (retries > 0) {
            try {
                if (!this.client.pupPage || this.client.pupPage.isClosed()) {
                    const pages = await this.client.pupBrowser.pages();
                    this.client.pupPage = pages.find(p => p.url().includes('web.whatsapp.com')) || pages[0];
                }
                return await this.client.pupPage.evaluate(fn, ...args);
            } catch (e) {
                if (e.message.includes('detached') || e.message.includes('Session closed')) {
                    retries--; await new Promise(r => setTimeout(r, 1500));
                } else throw e;
            }
        }
        throw new Error('Browser Error');
    }

    async extractGroupContacts(groupId, options = {}) {
        if (!this.isReady) throw new Error('Client not ready')
        const { onProgress, resumeFrom = 0 } = options
        try {
            const rawData = await this._safeEvaluate(async (gid) => {
                let chat = window.Store.Chat.get(gid) || await window.Store.Chat.find(gid);
                if (!chat) throw new Error('Chat not found');

                // 1.0.11 Discrete Metadata Recovery
                let meta = chat.groupMetadata || window.Store.GroupMetadata?.get(gid);
                if ((!meta || !meta.participants || meta.participants.length <= 1) && window.Store.GroupMetadata?.find) {
                    try {
                        await window.Store.GroupMetadata.find(gid);
                        await new Promise(r => setTimeout(r, 600)); // Wait for sync
                        meta = chat.groupMetadata || window.Store.GroupMetadata?.get(gid);
                    } catch (e) { }
                }

                // Resilient Array Conversion (Collection-safe)
                let participants = [];
                if (meta && meta.participants) {
                    const p = meta.participants;
                    if (Array.isArray(p)) participants = p;
                    else if (typeof p.toArray === 'function') participants = p.toArray();
                    else if (p.models && Array.isArray(p.models)) participants = p.models;
                    else {
                        try { participants = Array.from(p); } catch (e) { participants = []; }
                    }
                }

                const mapped = [];
                for (const p of participants) {
                    const id = p.id?._serialized || p.id || '';
                    let contact = window.Store.Contact.get(id);
                    let phone = '';

                    // 1.0.11 Deep Resolution Strategy for LIDs
                    if (id.includes('@c.us')) {
                        phone = id.split('@')[0];
                    } else if (id.includes('@lid')) {
                        // Priority 1: Check native phoneNumber field
                        if (contact?.phoneNumber) {
                            phone = contact.phoneNumber;
                        }
                        // Priority 2: Check WID (WhatsApp ID) canonical link
                        else if (contact?.wid?._serialized?.includes('@c.us')) {
                            phone = contact.wid.user;
                        }
                        // Priority 3: Force Resolve via Browser Sync
                        else if (window.Store.Contact.find) {
                            try {
                                const resolved = await window.Store.Contact.find(id);
                                if (resolved?.phoneNumber) phone = resolved.phoneNumber;
                                else if (resolved?.wid?._serialized?.includes('@c.us')) phone = resolved.wid.user;
                            } catch (e) { }
                        }
                    }

                    // Multi-Device Clean Task (Cleanup @c.us, Colons, etc)
                    phone = String(phone || '');
                    if (phone.includes('@')) phone = phone.split('@')[0];
                    if (phone.includes(':')) phone = phone.split(':')[0];

                    // If resolution failed, skip LIDs to prevent trash in database
                    if (!phone || phone === 'undefined' || phone.includes('@lid') || phone.length < 5) continue;

                    const pushname = contact?.pushname || contact?.name || contact?.formattedName || '';

                    mapped.push({
                        user: String(phone),
                        isAdmin: !!(p.isAdmin || p.isSuperAdmin),
                        name: String(pushname).trim()
                    });
                }

                return { name: chat.name || chat.formattedTitle || 'Group', participants: mapped };
            }, groupId)

            if (!rawData || !rawData.participants) return [];

            const contacts = [];
            const seen = new Set();
            const CHUNK_SIZE = 10000; // TITAN TURBO X: 10k Payload

            for (let i = resumeFrom; i < rawData.participants.length; i++) {
                if (this.isCancelled) return contacts;

                const p = rawData.participants[i];
                // Titan 1.0.11 Logic: Ignore system entries and very short strings
                if (!p.user || p.user.length < 5 || p.user.length > 20 || seen.has(p.user)) continue;

                seen.add(p.user);
                contacts.push({
                    phone: p.user,
                    name: p.name,
                    groupSource: rawData.name,
                    sourceGroupId: groupId,
                    isAdmin: !!p.isAdmin
                });

                if (contacts.length % CHUNK_SIZE === 0) {
                    this.emit('progress', {
                        contacts: contacts.slice(-CHUNK_SIZE),
                        progress: {
                            processed: i + 1,
                            total: rawData.participants.length,
                            contactCount: contacts.length
                        }
                    });
                    await new Promise(r => setTimeout(r, 10)); // Yield
                }
            }

            // Flush Remaining
            const lastChunkSize = contacts.length % CHUNK_SIZE;
            if (lastChunkSize > 0 || (contacts.length > 0 && contacts.length < CHUNK_SIZE)) {
                const sliceSize = lastChunkSize > 0 ? lastChunkSize : contacts.length;
                this.emit('progress', {
                    contacts: contacts.slice(-sliceSize),
                    progress: {
                        processed: rawData.participants.length,
                        total: rawData.participants.length,
                        contactCount: contacts.length
                    }
                });
            }

            this.registry.clearExtractionState(this.number)
            return contacts
        } catch (err) { console.error("Extraction Error:", err); throw err }
    }

    async sendMessage(jid, text, mediaPath = null, skipLock = false) {
        if (!this.isReady) throw new Error('Not ready')
        if (!skipLock) { while (this._isOccupied) await this._delay(2000); this._isOccupied = true }
        const cleanBody = (text || "").trim(); if (cleanBody) this._botSentBuffer.add(cleanBody)
        try {
            if (mediaPath && fs.existsSync(mediaPath)) {
                const media = MessageMedia.fromFilePath(mediaPath)
                const msg = await this.client.sendMessage(jid, media, { caption: text || null, sendMediaAsDocument: false, unsafeMime: true })
                if (!skipLock) { await this._delay(1000 + Math.random() * 2000); this._isOccupied = false; this._lastSimFinishedAt = Date.now() }
                return { success: true, messageId: msg?.id?._serialized }
            } else {
                const msg = await this.client.sendMessage(jid, text || " ")
                if (!skipLock) { await this._delay(1000 + Math.random() * 2000); this._isOccupied = false; this._lastSimFinishedAt = Date.now() }
                return { success: true, messageId: msg?.id?._serialized }
            }
        } catch (err) {
            if (!skipLock) this._isOccupied = false
            return await this._surgicalSendMessage(jid, text)
        }
    }

    async _surgicalSendMessage(jid, text) {
        try {
            return await this.client.pupPage.evaluate(async (toJid, msgText) => {
                try {
                    let chat = window.Store.Chat.get(toJid) || await window.Store.Chat.find(toJid);
                    if (window.WWebJS?.sendMessage) { await window.WWebJS.sendMessage(chat, msgText); return { success: true }; }
                    if (window.Store.SendMessage?.sendMsgToChat) { await window.Store.SendMessage.sendMsgToChat(chat, msgText); return { success: true }; }
                    if (chat.sendMessage) { await chat.sendMessage(msgText); return { success: true }; }
                    throw new Error('No send method');
                } catch (e) { return { success: false, error: e.message }; }
            }, jid, text);
        } catch (err) { return { success: false, error: err.message }; }
    }

    async _vaccinateStore() {
        try {
            await this.client.pupPage.evaluate(() => {
                if (window.WWebJS?.sendSeen) {
                    const original = window.WWebJS.sendSeen;
                    window.WWebJS.sendSeen = async function (id) { try { return await original(id); } catch (e) { return { success: true }; } };
                }
            });
        } catch (e) { }
    }

    async close() { this.isCancelled = true; this.isReady = false; if (this.client) await this.client.destroy().catch(() => { }) }

    async dispatchHumanReply(jid, textTemplate) {
        if (this._pendingReplies.has(jid)) return
        const timer = setTimeout(async () => {
            try {
                await this._delay(2000)
                let finalMsg = textTemplate
                try {
                    const contact = await this.client.getContactById(jid).catch(() => null)
                    finalMsg = textTemplate.replace(/{name}/gi, (contact?.pushname || contact?.name || 'there'))
                } catch (e) { }
                await this.sendMessage(jid, finalMsg, null, true)
            } catch (err) { } finally { this._pendingReplies.delete(jid) }
        }, 100)
        this._pendingReplies.set(jid, timer)
    }

    _delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }
    getGroupCache() { return this._groupCache || [] }
}

module.exports = ExtractionWorker
