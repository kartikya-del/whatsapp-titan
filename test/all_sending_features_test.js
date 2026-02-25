const assert = require('assert');
const EventEmitter = require('events');

console.log("🧪 STARTING COMPREHENSIVE EDGE CASE SUITE: ALL SENDING FEATURES\n");

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
        // console.log(`[WORKER-${this.number}] sendMessage called. skipLock=${skipLock}, isOccupied=${this._isOccupied}`);

        if (!skipLock) {
            const start = Date.now();
            while (this._isOccupied) {
                await this._delay(50);
            }
            this._isOccupied = true;
        }

        // Simulate sending duration
        await this._delay(20);
        this.sentMessages.push({ jid, text, skipLock });

        if (!skipLock) {
            this._isOccupied = false;
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
        // Tracks simulated "leads" for outbound tracking
        this.outboundLedger = new Map();
        this.campaignManager = { getCampaignStatus: () => null, incrementVariantReply: () => { } };
    }

    registerWorker(number) {
        const worker = new MockWorker(number);
        this.workers.set(number, worker);
        return worker;
    }

    // Logic from extractionManager.js
    _test_isAutoReplyEnabled(workerNumber) {
        const workerOverride = this.workerAutoReplyOverrides.get(workerNumber);
        let isAutoReplyEnabled = this.autoReplySettings.enabled;

        if (workerOverride && typeof workerOverride.autoReply === 'boolean') {
            isAutoReplyEnabled = workerOverride.autoReply;
        }
        return isAutoReplyEnabled;
    }

    // Logic from extractionManager.js (Self-Reply Filter)
    _test_checkSelfReply(fromJid) {
        const senderNum = fromJid.split('@')[0];
        if (this.workers.has(senderNum)) {
            return true; // IS self-reply (should be ignored)
        }
        return false;
    }
}

// Logic from app.js (Validation)
const validateDelays = (min, max) => {
    let newMin = min;
    let newMax = max;

    // RULE 1: Min >= 10, Max >= 20
    if (newMin < 10) newMin = 10;
    if (newMax < 20) newMax = 20;

    // RULE 2: Gap >= 10
    // If Min is pushed up, Max might need to go up
    if (newMax < newMin + 10) newMax = newMin + 10;

    // If Max is pushed down (user input), Min might need to go down
    // But here we act as "state update filters"
    // Let's test the "Input Handler" logic specifically
    return { min: newMin, max: newMax };
}

// Mimic the blur handler logic specifically
const onBlurMin = (val, currentMax) => {
    let v = val;
    if (v < 10) v = 10;
    if (v > currentMax - 10) v = currentMax - 10;
    return v;
}

const onBlurMax = (val, currentMin) => {
    let v = val;
    if (v < 20) v = 20;
    if (v < currentMin + 10) v = currentMin + 10;
    return v;
}


// --- MAIN TEST RUNNER ---
async function runTests() {
    const manager = new MockManager();
    const workerA = manager.registerWorker('8888888888');
    const workerB = manager.registerWorker('9999999999');

    console.log("🔹 TEST 1: Delay Input Validation (10s Gap Rule)");

    // Case 1: User tries to set Min=5, Max=60
    let min = onBlurMin(5, 60);
    assert.strictEqual(min, 10, "Min should clamp to 10");
    console.log("  ✅ Min < 10 -> Clamps to 10");

    // Case 2: User tries to set Max=15
    let max = onBlurMax(15, 10); // current Min 10
    assert.strictEqual(max, 20, "Max should clamp to 20");
    console.log("  ✅ Max < 20 -> Clamps to 20");

    // Case 3: Collision - Current Max=30. User sets Min=25.
    // Logic: if (val > currentMax - 10) val = currentMax - 10
    // 25 > (30-10=20). So val becomes 20.
    min = onBlurMin(25, 30);
    assert.strictEqual(min, 20, "Min should hold back to maintain 10s gap from Max");
    console.log("  ✅ Min enforces gap (capped by Max)");

    // Case 4: Collision - Current Min=50. User sets Max=55.
    // Logic: if (val < currentMin + 10) val = currentMin + 10
    // 55 < (50+10=60). So val becomes 60.
    max = onBlurMax(55, 50);
    assert.strictEqual(max, 60, "Max should push forward to maintain 10s gap from Min");
    console.log("  ✅ Max enforces gap (pushed by Min)");


    console.log("\n🔹 TEST 2: Per-Worker Auto-Reply State");
    manager.autoReplySettings.enabled = false; // Global OFF
    manager.workerAutoReplyOverrides.set('8888888888', { autoReply: true }); // Worker A ON

    assert.strictEqual(manager._test_isAutoReplyEnabled('8888888888'), true, "Worker A should be ON");
    assert.strictEqual(manager._test_isAutoReplyEnabled('9999999999'), false, "Worker B should be OFF (Global Default)");
    console.log("  ✅ Independent Worker States Confirmed");


    console.log("\n🔹 TEST 3: Self-Reply / Loop Prevention");
    // Scenario: Worker B sends message to Worker A.
    // 'from' JID: '9999999999@c.us'
    const isSelf = manager._test_checkSelfReply('9999999999@c.us');
    assert.strictEqual(isSelf, true, "Should detect Worker B is a worker");

    // Scenario: Random customer sends message
    const isCustomer = manager._test_checkSelfReply('1234567890@c.us');
    assert.strictEqual(isCustomer, false, "Should detect Customer is NOT a worker");
    console.log("  ✅ Loop Prevention Logic Correct");


    console.log("\n🔹 TEST 4: Priority Action Lock (Deadlock Prevention)");

    // 1. Lock Worker A (Busy)
    workerA._isOccupied = true;

    // 2. Campaign Send (skipLock=false) -> Should Block
    let campaignSent = false;
    workerA.sendMessage('target@c.us', 'Campaign Mock', null, false).then(() => { campaignSent = true; });

    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(campaignSent, false, "Campaign message must wait for lock");
    console.log("  ✅ Campaign waiting...");

    // 3. Auto-Reply Send (skipLock=true) -> Should Pass
    await workerA.sendMessage('reply@c.us', 'Auto-Reply Mock', null, true);
    assert.strictEqual(workerA.sentMessages.length, 1, "Auto-reply sent immediately");
    console.log("  ✅ Auto-Reply bypassed lock");

    // 4. Release Lock
    workerA._isOccupied = false;

    // 5. Campaign should finish
    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(campaignSent, true, "Campaign message finished");
    assert.strictEqual(workerA.sentMessages.length, 2, "Both messages sent");
    console.log("  ✅ Campaign resumed");


    console.log("\n🔹 TEST 5: UI State Logic (Button Locking/Unlocking)");

    // Mock Global State
    let _activeCampaigns = new Map();

    // Helper to simulate isRunning check
    const isUI_Locked = () => {
        return Array.from(_activeCampaigns.values()).some(c => ['RUNNING', 'WAITING', 'INITIALIZED'].includes(c.status));
    };

    // Case 1: No campaigns -> Unlocked
    assert.strictEqual(isUI_Locked(), false, "UI should be UNLOCKED when empty");
    console.log("  ✅ Empty State -> Unlocked");

    // Case 2: Campaign Created (Running) -> Locked
    _activeCampaigns.set('camp_1', { status: 'RUNNING' });
    assert.strictEqual(isUI_Locked(), true, "UI should be LOCKED when Running");
    console.log("  ✅ Running State -> Locked");

    // Case 3: Campaign Waiting -> Locked
    _activeCampaigns.set('camp_1', { status: 'WAITING' });
    assert.strictEqual(isUI_Locked(), true, "UI should be LOCKED when Waiting");
    console.log("  ✅ Waiting State -> Locked");

    // Case 4: Campaign Complete -> Unlocked
    _activeCampaigns.set('camp_1', { status: 'COMPLETE' });
    assert.strictEqual(isUI_Locked(), false, "UI should be UNLOCKED when Complete");
    console.log("  ✅ Complete State -> Unlocked");

    // Case 5: Campaign Stopped -> Unlocked
    _activeCampaigns.set('camp_1', { status: 'STOPPED' });
    assert.strictEqual(isUI_Locked(), false, "UI should be UNLOCKED when Stopped");
    console.log("  ✅ Stopped State -> Unlocked");

    // Case 6: Mixed State (One Complete, One Running) -> Locked
    _activeCampaigns.set('camp_2', { status: 'RUNNING' });
    assert.strictEqual(isUI_Locked(), true, "UI should be LOCKED if ANY campaign is running");
    console.log("  ✅ Mixed State -> Locked");

    console.log("\n✅ ALL 5 FEATURE SETS (Logic + UI State) PASSED!");
}

runTests().catch(e => console.error(e));
