
// TITAN: Helper to archive campaigns before they are wiped
function _archiveActiveCampaigns() {
    let sessionReplied = 0;

    _activeCampaigns.forEach(c => {
        let campSent = 0
        let campReplied = 0
        let campFailed = 0
        const archivedVariants = []

        if (c.variantStats) {
            c.variantStats.forEach((vs, vIdx) => {
                campSent += (vs.sent || 0)
                campReplied += (vs.replied || 0)
                sessionReplied += (vs.replied || 0)

                // Calculate failure for this specific variant index
                // Note: vIdx + 1 matches variantNum
                const vFailed = c.leads ? c.leads.filter(l => l.variantNum === (vIdx + 1) && l.status === 'FAILED').length : 0

                archivedVariants.push({
                    text: vs.text,
                    sent: vs.sent,
                    replied: vs.replied,
                    failed: vFailed
                })
            })
        }

        // Global failures (including non-variant specific if any, though usually tracked above)
        // We use the sum of variant failures to be accurate to the matrix
        const totalVariantFailed = archivedVariants.reduce((a, b) => a + b.failed, 0)
        campFailed = totalVariantFailed

        _campaignHistory.push({
            id: c.id,
            timestamp: Date.now(),
            stats: { sent: campSent, replied: campReplied, failed: campFailed },
            variants: archivedVariants
        })
    })

    _campaignStats.totalReceived += sessionReplied
    window.api.configSave({ campaignHistory: _campaignHistory, campaignStats: _campaignStats })
}
