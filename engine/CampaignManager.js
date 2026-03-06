const EventEmitter = require('events')
const fs = require('fs')
const path = require('path')

class CampaignManager extends EventEmitter {
    constructor({ registry, logsDir }) {
        super()
        this.registry = registry
        this.logsDir = logsDir
        this.campaignsDir = path.join(this.logsDir, 'campaigns')
        this.activeQueues = new Map()

        if (!fs.existsSync(this.campaignsDir)) {
            fs.mkdirSync(this.campaignsDir, { recursive: true })
        }
    }

    async createCampaign(leads, mapping, variants = []) {
        const campaignId = `campaign_${Date.now()}`
        const campaignPath = path.join(this.campaignsDir, campaignId)
        fs.mkdirSync(campaignPath, { recursive: true })

        console.log(`[CAMPAIGN] Creating ${campaignId} with ${leads.length} leads`)

        const assignments = {}
        const variantStats = variants.map(v => ({ text: v, sent: 0, replied: 0 }))

        for (const map of mapping) {
            const segment = map.indices.map(idx => leads[idx]).filter(l => l !== undefined)
            if (segment.length === 0) continue

            const queueFile = path.join(campaignPath, `queue_${map.number}.json`)
            const queueData = {
                campaignId,
                number: map.number,
                total: segment.length,
                matrix: map.indices,
                sent: 0,
                failed: 0,
                replied: 0,
                status: 'PENDING',
                contacts: segment
            }
            fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2))
            assignments[map.number] = queueFile
        }

        const campaignState = {
            id: campaignId,
            timestamp: Date.now(),
            totalLeads: leads.length,
            assignments,
            variants,
            variantStats,
            status: 'INITIALIZED'
        }
        fs.writeFileSync(path.join(campaignPath, 'state.json'), JSON.stringify(campaignState, null, 2))
        return campaignId
    }

    getCampaignStatus(campaignId) {
        const campaignPath = path.join(this.campaignsDir, campaignId)
        if (!fs.existsSync(campaignPath)) return null
        return JSON.parse(fs.readFileSync(path.join(campaignPath, 'state.json'), 'utf8'))
    }

    getQueue(campaignId, number) {
        const queueFile = path.join(this.campaignsDir, campaignId, `queue_${number}.json`)
        if (!fs.existsSync(queueFile)) return null
        return JSON.parse(fs.readFileSync(queueFile, 'utf8'))
    }

    updateQueueProgress(campaignId, number, updates) {
        const queueFile = path.join(this.campaignsDir, campaignId, `queue_${number}.json`)
        if (!fs.existsSync(queueFile)) return
        const data = JSON.parse(fs.readFileSync(queueFile, 'utf8'))
        const newData = { ...data, ...updates }
        fs.writeFileSync(queueFile, JSON.stringify(newData, null, 2))
        this.emit('queue:progress', { campaignId, number, ...updates })
    }

    incrementVariantSent(campaignId, variantIdx) {
        const stateFile = path.join(this.campaignsDir, campaignId, 'state.json')
        if (!fs.existsSync(stateFile)) return
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
        if (state.variantStats && state.variantStats[variantIdx]) {
            state.variantStats[variantIdx].sent++
            fs.writeFileSync(stateFile, JSON.stringify(state, null, 2))
            this.emit('campaign:state', { campaignId, state })
        }
    }

    incrementVariantReply(campaignId, variantIdx, workerNumber) {
        const stateFile = path.join(this.campaignsDir, campaignId, 'state.json')
        if (!fs.existsSync(stateFile)) return
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
        if (state.variantStats && state.variantStats[variantIdx]) {
            state.variantStats[variantIdx].replied++
            fs.writeFileSync(stateFile, JSON.stringify(state, null, 2))
            this.emit('campaign:state', { campaignId, state })
        }
        const queueFile = path.join(this.campaignsDir, campaignId, `queue_${workerNumber}.json`)
        if (fs.existsSync(queueFile)) {
            const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'))
            queue.replied = (queue.replied || 0) + 1
            fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2))
            this.emit('queue:progress', { campaignId, number: workerNumber, replied: queue.replied })
        }
    }

    async parseLeadsFile(filePath) {
        const XLSX = require('xlsx')
        const workbook = XLSX.readFile(filePath)
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet)
        const leads = []
        rows.forEach(row => {
            let phone = ''; let name = ''
            Object.entries(row).forEach(([k, v]) => {
                const key = k.toLowerCase().trim(); const val = String(v).trim()
                if (key.includes('phone') || key.includes('number') || key.includes('mobile') || key.includes('contact')) {
                    const clean = val.replace(/\D/g, '')
                    if (clean.length >= 8) phone = clean
                } else if (key.includes('name') || key.includes('lead') || key.includes('contact')) {
                    if (val && val.length > 1) name = val
                }
            })
            if (!phone) {
                Object.values(row).forEach(v => {
                    const clean = String(v).replace(/\D/g, '')
                    if (clean.length >= 8 && clean.length <= 13) phone = clean
                })
            }
            if (phone) leads.push({ name: name || '', phone, groupSource: 'Excel Import' })
        })
        return leads
    }
}

module.exports = CampaignManager
