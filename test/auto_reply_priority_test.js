const assert = require('assert');
const EventEmitter = require('events');

console.log("🧪 STARTING EDGE CASE TEST: Priority Lock & Auto-Reply State\n");

// --- MOCKS ---
class MockWorker extends EventEmitter {
    constructor(number) {
        super();
        this.number = number;
        this._isOccupied = false;
        this.autoReplySettings = { enabled: false };
        this.sentMessages = [];
    }

    async _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    async sendMessage(jid, text, media, skipLock = false) {
        console.log(`[WORKER] sendMessage called. skipLock=${skipLock}, isOccupied=${this._isOccupied}`);

        if (!skipLock) {
            console.log(`[WORKER] Campaign message waiting for lock...`);
            const start = Date.now();
            while (this._isOccupied) {
                await this._delay(100);
            }
            console.log(`[WORKER] Lock acquired after ${(Date.now() - start)}ms`);
            this._isOccupied = true;
        }

        // Simulate sending
        await this._delay(50);
        this.sentMessages.push({ jid, text, skipLock });
        console.log(`[WORKER] Message SENT: ${text}`);

        if (!skipLock) {
            this._isOccupied = false;
            console.log(`[WORKER] Lock released.`);
        }
        return { success: true };
    }

    setAutoReplySettings(s) { this.autoReplySettings = s; }
}

class MockManager extends EventEmitter {
    constructor() {
        super();
        this.workers = new Map();
        this.workerAutoReplyOverrides = new Map();
        this.autoReplySettings = { enabled: false, rules: [] };
        this.outboundLedger = new Map(); // Needed for handleIncoming
        this.campaignManager = { getCampaignStatus: () => null, incrementVariantReply: () => { } };
    }

    // Copying the LOGIC from ExtractionManager.js for testing
    // (In a real unit test we would import the file, but dependencies make it hard)
    _test_isAutoReplyEnabled(workerNumber) {
        const workerOverride = this.workerAutoReplyOverrides.get(workerNumber);
        let isAutoReplyEnabled = this.autoReplySettings.enabled;

        if (workerOverride && typeof workerOverride.autoReply === 'boolean') {
            isAutoReplyEnabled = workerOverride.autoReply;
        }
        return isAutoReplyEnabled;
    }
}

// --- TEST SUITE ---

async function runTests() {
    const worker = new MockWorker('12345');
    const manager = new MockManager();
    manager.workers.set('12345', worker);

    // TEST 1: Auto-Reply State Logic
    console.log("🔹 TEST 1: Auto-Reply State Logic (Per-Worker Override)");

    // Case A: Global OFF, Worker Default -> OFF
    manager.autoReplySettings.enabled = false;
    assert.strictEqual(manager._test_isAutoReplyEnabled('12345'), false, "Should be OFF (Global default)");
    console.log("  ✅ Global OFF -> OFF");

    // Case B: Global OFF, Worker ON -> ON
    manager.workerAutoReplyOverrides.set('12345', { autoReply: true });
    assert.strictEqual(manager._test_isAutoReplyEnabled('12345'), true, "Should be ON (Worker Override)");
    console.log("  ✅ Global OFF + Worker ON -> ON");

    // Case C: Global ON, Worker OFF -> OFF
    manager.autoReplySettings.enabled = true;
    manager.workerAutoReplyOverrides.set('12345', { autoReply: false });
    assert.strictEqual(manager._test_isAutoReplyEnabled('12345'), false, "Should be OFF (Worker Override)");
    console.log("  ✅ Global ON + Worker OFF -> OFF");

    // TEST 2: Action Lock Priority
    console.log("\n🔹 TEST 2: Action Lock Priority (Campaign vs Auto-Reply)");

    // Scenario: Auto-Reply starts, locks worker. Campaign tries to send.
    // Campaign should WAIT until Auto-Reply is done.

    // 1. Auto-Reply activates lock
    console.log("  👉 Auto-Reply taking lock...");
    worker._isOccupied = true;

    // 2. Campaign attempts to send (async)
    console.log("  👉 Campaign attempting send...");
    const campaignPromise = worker.sendMessage('target@c.us', 'Campaign Message', null, false);

    // 3. Confirm nothing sent yet (Campaign is blocked)
    await new Promise(r => setTimeout(r, 200));
    assert.strictEqual(worker.sentMessages.length, 0, "Campaign should be blocked by lock");
    console.log("  ✅ Campaign is correctly blocked.");

    // 4. Auto-Reply finishes and sends (skipLock=true)
    console.log("  👉 Auto-Reply sending response (skipLock=true)...");
    await worker.sendMessage('reply@c.us', 'Auto-Reply', null, true);
    assert.strictEqual(worker.sentMessages[0].text, 'Auto-Reply', "Auto-Reply sent successfully");
    console.log("  ✅ Auto-Reply bypassed lock.");

    // 5. Auto-Reply releases lock
    console.log("  👉 Auto-Reply releasing lock...");
    worker._isOccupied = false;

    // 6. Campaign should now succeed
    await campaignPromise;
    assert.strictEqual(worker.sentMessages[1].text, 'Campaign Message', "Campaign message sent after lock release");
    console.log("  ✅ Campaign resumed and sent message.");

    console.log("\n✅ ALL EDGE CASE TESTS PASSED!");
}

runTests().catch(e => console.error("❌ TEST FAILED:", e));
