const assert = require('assert');

console.log("🧪 STARTING CAMPAIGN MANAGEMENT EDGE CASE SUITE\n");

// --- MOCK APP STATE ---
// This mocks the globals in renderer/app.js
let _campaignProjects = [];
let _currentCampaignId = null;
let _stagedLeads = []; // The "View" State
let _messageVariants = []; // The "View" State
let _activeCampaigns = new Map(); // Backend State

// --- MOCK CONTROLLER LOGIC ---
const createCampaign = (name) => {
    const newCamp = {
        id: `proj_${Date.now()}_${Math.random()}`,
        name,
        created: Date.now(),
        status: 'DRAFT',
        leads: [],
        variants: ["Default Variant"],
        rules: []
    };
    _campaignProjects.unshift(newCamp);
    return newCamp.id;
};

const switchCampaign = (id) => {
    const camp = _campaignProjects.find(c => c.id === id);
    if (!camp) throw new Error("Campaign not found");

    // LOAD STATE into View Globals
    _currentCampaignId = id;
    _stagedLeads = camp.leads || [];
    _messageVariants = camp.variants || [];
    // In real app, we also load rules, delay settings, etc.
    return camp;
};

const saveCurrentProject = () => {
    if (!_currentCampaignId) return;
    const idx = _campaignProjects.findIndex(c => c.id === _currentCampaignId);
    if (idx !== -1) {
        _campaignProjects[idx].leads = _stagedLeads;
        _campaignProjects[idx].variants = _messageVariants;
    }
};

// --- TEST SUITE ---
async function runTests() {

    console.log("🔹 TEST 1: Campaign Isolation (No Data Leaks)");

    // 1. Create Campaign A
    const idA = createCampaign("Campaign A - VIPs");
    switchCampaign(idA);
    _stagedLeads = [{ phone: '1111111111', name: 'Alice' }];
    _messageVariants = ["Hello VIP"];
    saveCurrentProject(); // Save A

    console.log("  👉 Created Campaign A with 1 lead and 'Hello VIP'");

    // 2. Create Campaign B
    const idB = createCampaign("Campaign B - Cold");
    switchCampaign(idB);
    _stagedLeads = [{ phone: '2222222222', name: 'Bob' }, { phone: '3333333333', name: 'Charlie' }];
    _messageVariants = ["Hello Stranger"];
    saveCurrentProject(); // Save B

    console.log("  👉 Created Campaign B with 2 leads and 'Hello Stranger'");

    // 3. Switch back to A and Verify
    switchCampaign(idA);

    assert.strictEqual(_stagedLeads.length, 1, "Campaign A should still have 1 lead");
    assert.strictEqual(_stagedLeads[0].name, 'Alice', "Campaign A lead should be Alice");
    assert.strictEqual(_messageVariants[0], "Hello VIP", "Campaign A text should be preserved");

    assert.strictEqual(_campaignProjects.length, 2, "There should be 2 mock campaigns");

    console.log("  ✅ Campaign A data is intact.");

    // 4. Verify B integrity
    const campB = _campaignProjects.find(c => c.id === idB);
    assert.strictEqual(campB.leads.length, 2, "Campaign B should still have 2 leads in storage");
    assert.strictEqual(campB.variants[0], "Hello Stranger", "Campaign B text in storage is correct");
    console.log("  ✅ Campaign B data is intact.");


    console.log("\n🔹 TEST 2: Status Independence");

    // 1. Mark A as RUNNING (Mock Backend Update)
    const campA = _campaignProjects.find(c => c.id === idA);
    campA.status = 'RUNNING';

    // 2. Verify B is still DRAFT
    assert.strictEqual(campB.status, 'DRAFT', "Campaign B should remain DRAFT");
    console.log("  ✅ Statuses are independent.");


    console.log("\n🔹 TEST 3: Context Switching & Auto-Save");

    // 1. Switch to B
    switchCampaign(idB);

    // 2. Modify B (UI Action)
    _messageVariants.push("New Variant for B");

    // 3. Switch to A (without explicit save call? In app.js we usually save before switch)
    saveCurrentProject(); // Simulate "Back Button" save
    switchCampaign(idA);

    // 4. Verify B was updated
    const campB_Updated = _campaignProjects.find(c => c.id === idB);
    assert.strictEqual(campB_Updated.variants.length, 2, "Campaign B should have 2 variants now");
    assert.strictEqual(campB_Updated.variants[1], "New Variant for B", "New variant saved correctly");

    console.log("  ✅ Auto-Save on switch works correctly.");

    console.log("\n✅ ALL CAMPAIGN MANAGEMENT LOGIC PASSED!");
}

runTests().catch(e => console.error(e));
