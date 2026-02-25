const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

/**
 * CampaignManager handles the lifecycle of outreach campaigns.
 * It manages lead distribution, message variants, and progress tracking.
 */
class CampaignManager extends EventEmitter {
    constructor({ registry, logsDir }) {
        super();
        this.registry = registry;
        this.logsDir = logsDir;
        this.campaignsDir = path.join(this.logsDir, 'campaigns');
        this.activeQueues = new Map();

        if (!fs.existsSync(this.campaignsDir)) {
            fs.mkdirSync(this.campaignsDir, { recursive: true });
        }
    }

    /**
     * Initializes a new campaign folder, distributes leads to accounts, and saves initial state.
     */
    async createCampaign(leads, assignments, variants = []) {
        const campaignId = 'campaign_' + Date.now();
        const campaignPath = path.join(this.campaignsDir, campaignId);

        fs.mkdirSync(campaignPath, { recursive: true });
        console.log(`[CAMPAIGN] Creating ${campaignId} with ${leads.length} leads`);

        const assignmentMap = {};
        const variantStats = variants.map(text => ({
            text: text,
            sent: 0,
            replied: 0
        }));

        for (const assignment of assignments) {
            const accountLeads = assignment.indices
                .map(index => leads[index])
                .filter(lead => lead !== undefined);

            if (accountLeads.length === 0) continue;

            const queueFile = path.join(campaignPath, `queue_${assignment.number}.json`);
            const queueData = {
                campaignId: campaignId,
                number: assignment.number,
                total: accountLeads.length,
                matrix: assignment.indices,
                sent: 0,
                failed: 0,
                replied: 0,
                status: 'PENDING',
                contacts: accountLeads
            };

            fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2));
            assignmentMap[assignment.number] = queueFile;
        }

        const campaignState = {
            id: campaignId,
            timestamp: Date.now(),
            totalLeads: leads.length,
            assignments: assignmentMap,
            variants: variants,
            variantStats: variantStats,
            status: 'INITIALIZED'
        };

        fs.writeFileSync(path.join(campaignPath, 'state.json'), JSON.stringify(campaignState, null, 2));

        return campaignId;
    }

    /**
     * Retrieves the high-level state of a campaign.
     */
    getCampaignState(campaignId) {
        const stateFile = path.join(this.campaignsDir, campaignId, 'state.json');
        if (!fs.existsSync(stateFile)) return null;

        try {
            return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        } catch (err) {
            console.error(`[CAMPAIGN] Error reading state for ${campaignId}:`, err.message);
            return null;
        }
    }

    /**
     * Retrieves the specific lead queue for an account within a campaign.
     */
    getQueue(campaignId, number) {
        const queueFile = path.join(this.campaignsDir, campaignId, `queue_${number}.json`);
        if (!fs.existsSync(queueFile)) return null;

        try {
            return JSON.parse(fs.readFileSync(queueFile, 'utf8'));
        } catch (err) {
            console.error(`[CAMPAIGN] Error reading queue ${number} for ${campaignId}:`, err.message);
            return null;
        }
    }

    /**
     * Updates the progress of a specific account's queue and persists it.
     */
    updateQueueProgress(campaignId, number, updates) {
        const queueFile = path.join(this.campaignsDir, campaignId, `queue_${number}.json`);
        if (!fs.existsSync(queueFile)) return;

        try {
            const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
            const updatedQueue = { ...queue, ...updates };

            fs.writeFileSync(queueFile, JSON.stringify(updatedQueue, null, 2));

            // Notify UI
            this.emit('queue:progress', {
                campaignId,
                number,
                ...updates
            });
        } catch (err) {
            console.error(`[CAMPAIGN] Failed to update queue progress for ${number}:`, err.message);
        }
    }

    /**
     * Tracks message sending per variant for analytics.
     */
    incrementVariantSent(campaignId, variantIndex) {
        const stateFile = path.join(this.campaignsDir, campaignId, 'state.json');
        if (!fs.existsSync(stateFile)) return;

        try {
            const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
            if (state.variantStats && state.variantStats[variantIndex]) {
                state.variantStats[variantIndex].sent++;
                fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

                this.emit('campaign:state', {
                    campaignId,
                    state: state
                });
            }
        } catch (err) {
            console.error(`[CAMPAIGN] Failed to increment variant stats:`, err.message);
        }
    }

    /**
     * Increments reply count for a variant and the specific account queue.
     */
    incrementVariantReplied(campaignId, variantIndex, number) {
        // Update global campaign variant stats
        const stateFile = path.join(this.campaignsDir, campaignId, 'state.json');
        if (fs.existsSync(stateFile)) {
            try {
                const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                if (state.variantStats && state.variantStats[variantIndex]) {
                    state.variantStats[variantIndex].replied++;
                    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
                    this.emit('campaign:state', { campaignId, state: state });
                }
            } catch (err) { }
        }

        // Update specific account queue stats
        const queueFile = path.join(this.campaignsDir, campaignId, `queue_${number}.json`);
        if (fs.existsSync(queueFile)) {
            try {
                const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
                queue.replied = (queue.replied || 0) + 1;
                fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));

                this.emit('queue:progress', {
                    campaignId,
                    number,
                    replied: queue.replied
                });
            } catch (err) { }
        }
    }

    /**
     * Parses an Excel file into a standard list of Lead objects.
     */
    async importLeadsFromFile(filePath) {
        const workbook = xlsx.readFile(filePath);
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const rawJson = xlsx.utils.sheet_to_json(sheet);
        const leads = [];

        rawJson.forEach(row => {
            let phone = '';
            let name = '';

            // Heuristic detection of phone/name columns
            Object.entries(row).forEach(([colName, cellValue]) => {
                const key = colName.toLowerCase().replace(/\s/g, '');
                const val = String(cellValue).trim();

                if (key.includes('phone') || key.includes('number') || key.includes('mobile') || key.includes('contact')) {
                    const digits = val.replace(/\D/g, '');
                    if (digits.length >= 8) phone = digits;
                } else if (key.includes('name') || key.includes('lead') || key.includes('contact')) {
                    if (val && val.length > 1) name = val;
                }
            });

            // Second pass for phone if not found (look for anything that looks like a number)
            if (!phone) {
                Object.values(row).forEach(val => {
                    const digits = String(val).replace(/\D/g, '');
                    if (digits.length >= 8 && digits.length <= 15) {
                        phone = digits;
                    }
                });
            }

            if (phone) {
                leads.push({
                    name: name || '',
                    phone: phone,
                    groupSource: 'Excel Import'
                });
            }
        });

        return leads;
    }
}

module.exports = CampaignManager;