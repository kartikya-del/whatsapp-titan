
// TITAN 3.0 UI MOCK BRIDGE
// Simulates the Electron 'window.api' for browser-based testing

window.api = {
    configGet: async () => ({
        campaignStats: { totalSent: 15420, totalFailed: 124, totalReceived: 890, activeCampaigns: 2 },
        campaignHistory: [
            { id: 'camp_demo_1', stats: { sent: 500, replied: 45, failed: 2 }, variants: [{ text: 'Promo A', sent: 500, replied: 45 }] }
        ],
        campaignProjects: [
            { id: 'proj_1', name: 'Winter Outreach', status: 'DRAFT', leads: [] }
        ]
    }),
    configSave: (data) => console.log('[MOCK] Config Saved:', data),
    getSurvivabilityStats: async () => ({
        overview: {
            totalHealth: 94,
            status: 'READY',
            color: '#22c55e',
            remark: 'NETWORK STATUS NOMINAL. ALL SYSTEMS OPERATING WITHIN EXPECTED PARAMETERS.',
            riskAccounts: 1,
            criticalAccounts: 0,
            avgDeliveryRate: 98.2
        },
        accounts: [
            {
                number: '918882616461',
                healthScore: 98,
                status: 'READY',
                color: '#22c55e',
                remark: 'High engagement detected. Trust score optimal.',
                isTraining: false,
                messagesProcessed: 1205,
                metrics: { deliveryRate: 0.99, otr: 0.85, replyRate: 0.12, latency: 120 }
            },
            {
                number: '917004561234',
                healthScore: 65,
                status: 'RISK',
                color: '#f59e0b',
                remark: 'Elevated OTR latency detected. Reduce broadcast frequency.',
                isTraining: false,
                messagesProcessed: 450,
                metrics: { deliveryRate: 0.92, otr: 0.45, replyRate: 0.05, latency: 450 }
            }
        ]
    }),
    listAccounts: async () => [
        { number: '918882616461', state: 'logged_in', groupCount: 45, contactCount: 1200 },
        { number: '917004561234', state: 'logged_in', groupCount: 12, contactCount: 350 }
    ],
    getWarmerState: async () => ({ active: false, accounts: [] }),
    onCampaignProgress: (cb) => { /* Mock listener */ },
    onCampaignStatusUpdate: (cb) => { /* Mock listener */ },
    onNetworkLost: (cb) => { /* Mock listener */ },
    onNetworkRestored: (cb) => { /* Mock listener */ },
    onBotActivity: (cb) => { /* Mock listener */ },
    onMessageReceived: (cb) => { /* Mock listener */ },
    onWarmerUpdate: (cb) => { /* Mock listener */ },
    onSurvivabilityAck: (cb) => { /* Mock listener */ }
};

// Simulate Electron app name and environment
window.process = { env: { NODE_ENV: 'development' } };
console.log('🚀 TITAN MOCK BRIDGE ACTIVE');
