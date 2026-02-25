const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * SurvivabilityLedger manages a persistent append-only log of account-related events.
 * It tracks metrics, bans, and state changes over time for the SurvivabilityEngine.
 */
class SurvivabilityLedger {
    constructor(baseDir) {
        this.basePath = path.join(baseDir, 'survivability_ledger.jsonl');
        this._ensureFile();

        this._cache = new Map(); // messageId -> event
        this._accountIndex = new Map(); // accountNumber -> Set<messageId>
        this._isHydrated = false;
        this._hydrationPromise = null;
    }

    /**
     * Ensures the parent directory for the ledger exists.
     */
    _ensureFile() {
        const dir = path.dirname(this.basePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Loads existing events from the ledger into memory.
     * Uses a promise to prevent multiple concurrent hydration tasks.
     */
    async hydrate() {
        if (this._isHydrated) return;
        if (this._hydrationPromise) return this._hydrationPromise;

        this._hydrationPromise = (async () => {
            if (!fs.existsSync(this.basePath)) {
                this._isHydrated = true;
                return;
            }

            const stream = fs.createReadStream(this.basePath);
            const rl = readline.createInterface({
                input: stream,
                crlfDelay: Infinity
            });

            for await (const line of rl) {
                try {
                    const event = JSON.parse(line);
                    const id = event.messageId || event.event_id;
                    if (!id) continue;

                    if (!this._cache.has(id)) {
                        this._cache.set(id, event);
                        const account = event.account_id || event.number;
                        if (account) {
                            if (!this._accountIndex.has(account)) {
                                this._accountIndex.set(account, new Set());
                            }
                            this._accountIndex.get(account).add(id);
                        }
                    } else {
                        // If it's an update, merge it into the existing cache entry
                        Object.assign(this._cache.get(id), event);
                    }
                } catch (err) {
                    console.error('[LEDGER] Hydration parse error:', err.message);
                }
            }

            this._isHydrated = true;
            this._hydrationPromise = null;
        })();

        return this._hydrationPromise;
    }

    /**
     * Logs a new event to the ledger and updates memory cache.
     */
    async logEvent(event) {
        const id = event.messageId || event.event_id;
        if (id) {
            if (!this._cache.has(id)) {
                this._cache.set(id, { ...event });
                const account = event.account_id || event.number;
                if (account) {
                    if (!this._accountIndex.has(account)) {
                        this._accountIndex.set(account, new Set());
                    }
                    this._accountIndex.get(account).add(id);
                }
            } else {
                Object.assign(this._cache.get(id), event);
            }
        }

        const line = JSON.stringify(event) + '\n';
        // Use fs.promises for clean async append
        return fs.promises.appendFile(this.basePath, line);
    }

    /**
     * Updates an existing event by its ID.
     */
    async updateEvent(id, updates) {
        const payload = {
            messageId: id,
            ...updates,
            isUpdate: true,
            timestamp_update: Date.now()
        };
        return this.logEvent(payload);
    }

    /**
     * Retrieves all events.
     */
    async getAllEvents() {
        await this.hydrate();
        return Array.from(this._cache.values());
    }

    /**
     * Alias for getAllEvents to match ExtractionManager expectations.
     */
    async getMessageStates() {
        return this.getAllEvents();
    }

    /**
     * Retrieves events specifically for one account.
     */
    async getAccountEvents(number) {
        await this.hydrate();
        const ids = this._accountIndex.get(number);
        if (!ids) return [];

        return Array.from(ids)
            .map(id => this._cache.get(id))
            .filter(Boolean);
    }
}

module.exports = SurvivabilityLedger;