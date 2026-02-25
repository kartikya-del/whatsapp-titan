const WarmerManager = require('./engine/warmer/WarmerManager');
const AccountRegistry = require('./engine/AccountRegistry');
const ExtractionManager = require('./engine/ExtractionManager');
const path = require('path');
const fs = require('fs');

// Mock Dependencies
class MockWorker {
    constructor(number) {
        this.number = number;
        this.client = {
            getChatById: async (jid) => ({
                sendSeen: async () => { },
                sendStateTyping: async () => { },
                clearStateTyping: async () => { }
            }), // Mock Chat object
            getChats: async () => []
        };
        this.isOccupied = false;
    }
    async sendMessage(jid, text) {
        console.log(`[MockWorker-${this.number}] Sent "${text}" to ${jid}`);
        return { success: true };
    }
    async start() { }
    async close() { }
}

class MockExtractionManager {
    constructor() {
        this.registry = {
            listAccounts: () => [
                { number: '1111111111' },
                { number: '2222222222' },
                { number: '3333333333' }
            ]
        };
        this.workers = new Map();
        // Pre-populate workers for the test
        this.workers.set('1111111111', new MockWorker('1111111111'));
        this.workers.set('2222222222', new MockWorker('2222222222'));
        this.workers.set('3333333333', new MockWorker('3333333333'));
    }

    async startAccount(number) {
        console.log(`[MockManager] Starting account ${number}`);
        if (!this.workers.has(number)) {
            this.workers.set(number, new MockWorker(number));
        }
    }

    async closeAccount(number) {
        console.log(`[MockManager] Closing account ${number}`);
        // Don't actually remove worker to keep test simple, session engine handles logic
    }
}

async function runTest() {
    const testDir = path.join(__dirname, 'test_warmer_state');
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir);

    const mockManager = new MockExtractionManager();
    const warmer = new WarmerManager(mockManager, testDir);

    console.log('--- TEST START: Warmer Engine ---');

    // 1. Initialize
    warmer.start();

    // 2. Force Schedule Tick
    console.log('\n[Test] Forcing Scheduler Tick...');
    // We can't easily force private method _tick, but we can call checkAndStartSession manually
    warmer.checkAndStartSession();

    // 3. Monitor
    // Since SessionEngine runs async loop, we wait a bit
    await new Promise(r => setTimeout(r, 5000));

    console.log('\n[Test] Checking Active Sessions...');
    console.log('Active Sessions:', warmer.session.activeSessions.size);

    console.log('\n[Test] Checking Trust Graph...');
    const graph = warmer.graph.store.getTrustGraph();
    console.log('Graph Nodes:', Object.keys(graph.nodes));
    // Expect nodes to be populated by sync (triggered during selectActionTarget usually, or manual sync needed)
    // Actually TrustGraph.syncAccounts needs to be called.
    // WarmerManager doesn't call syncAccounts automatically on init?
    // Let's check WarmerManager implementation.
    // It calls `this.graph = new TrustGraph(this.store)`.
    // It invokes `this.session.startSession`.
    // `SessionEngine` calls `this.graph.selectActionTarget`.
    // `TrustGraph` logic handles empty graph gracefully?
    // If graph empty, `selectActionTarget` filters list.
    // But `syncAccounts` is not called.
    // Let's manually sync for test accuracy.
    warmer.graph.syncAccounts(mockManager.registry.listAccounts().map(a => a.number));

    await new Promise(r => setTimeout(r, 5000));

    warmer.stop();
    console.log('\n--- TEST END ---');

    // Cleanup
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
}

runTest();
