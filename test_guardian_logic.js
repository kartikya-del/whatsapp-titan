
const ExtractionManager = require('./engine/ExtractionManager');
const EventEmitter = require('events');

// Mock objects
const mockRegistry = {
    getLedger: () => ({ contacts: new Map() }),
    saveLedger: () => { }
};
const mockCampaignManager = {
    getCampaignStatus: () => ({ variants: [] }),
    incrementVariantReply: () => { }
};
const mockWorker = new EventEmitter();
mockWorker.number = '12345';
mockWorker._lastResponseTimes = new Map();
mockWorker.dispatchHumanReply = (jid, response) => {
    console.log(`[TEST] Worker dispatching reply to ${jid}: ${response}`);
};

const manager = new ExtractionManager({ registry: mockRegistry, campaignManager: mockCampaignManager });
manager.setAutoReplySettings({
    enabled: true,
    rules: [
        { keyword: 'charge', response: 'Our charges are $10.', mode: 'phrase' }
    ]
});

// Test 1: Fuzzy Stemming (charges -> charge)
console.log("\n--- TEST 1: Fuzzy Stemming ('charges' vs 'charge') ---");
manager._onMessageReceived(mockWorker, {
    from: 'client1@c.us',
    body: 'What are your charges?',
    timestamp: Math.floor(Date.now() / 1000)
});

// Test 2: Anti-Bot Filter (5s rule)
console.log("\n--- TEST 2: Anti-Bot Filter (Incoming in 2s) ---");
mockWorker._lastResponseTimes.set('client2@c.us', Math.floor(Date.now() / 1000) - 2);
manager._onMessageReceived(mockWorker, {
    from: 'client2@c.us',
    body: 'charge',
    timestamp: Math.floor(Date.now() / 1000)
});

// Test 3: Freshness Guard (Old message)
console.log("\n--- TEST 3: Freshness Guard (70s old) ---");
manager._onMessageReceived(mockWorker, {
    from: 'client3@c.us',
    body: 'charge',
    timestamp: Math.floor(Date.now() / 1000) - 70
});
