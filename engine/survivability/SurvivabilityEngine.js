const fs = require('fs');
const path = require('path');

/**
 * SurvivabilityEngine analyzes outreach metrics to estimate the "health" of a WhatsApp account.
 * It calculates a score from 0-100 reflecting the risk of restriction (ban).
 */
class SurvivabilityEngine {
    constructor(ledger, baseDir) {
        this.ledger = ledger;
        this.baseDir = baseDir;
        this.baselinesPath = path.join(baseDir, 'baselines.json');
        this.baselines = this._loadBaselines();
    }

    /**
     * Loads account baselines from disk.
     */
    _loadBaselines() {
        try {
            if (fs.existsSync(this.baselinesPath)) {
                return JSON.parse(fs.readFileSync(this.baselinesPath, 'utf8'));
            }
        } catch (err) {
            console.error('[SURVIVABILITY] Load baselines error:', err.message);
        }
        return {};
    }

    /**
     * Saves account baselines to disk.
     */
    _saveBaselines() {
        try {
            fs.writeFileSync(this.baselinesPath, JSON.stringify(this.baselines, null, 2));
        } catch (err) {
            console.error('[SURVIVABILITY] Save baselines error:', err.message);
        }
    }

    /**
     * Aggregates raw metrics for a specific account from the ledger.
     */
    async getAccountMetrics(number) {
        const events = await this.ledger.getAccountEvents(number);
        if (!events || events.length === 0) return null;

        // Sort by time
        events.sort((a, b) => a.timestamp_sent - b.timestamp_sent);

        const now = Date.now();
        const timeoutThreshold = 4 * 60 * 60 * 1000; // 4 hours for OTR calc

        const processBatch = (batch) => {
            if (!batch || batch.length === 0) return null;

            const total = batch.length;
            const delivered = batch.filter(e => e.ack_state >= 2).length;
            const failed = batch.filter(e => e.failed).length;

            // OTR: Delayed/Unknown delivery state (stuck at 'sent' for > 4h)
            const timedOutCount = batch.filter(e => e.ack_state === 1 && (now - (e.timestamp_sent || now) > timeoutThreshold)).length;

            const repliedCount = batch.filter(e => e.reply_received).length;

            const latencies = batch
                .filter(e => e.ack_state >= 2 && e.delivery_latency_ms > 0)
                .map(e => e.delivery_latency_ms)
                .sort((a, b) => a - b);

            const medianLatency = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : 0;

            return {
                deliveryRate: total > 0 ? delivered / total : 1,
                otr: total > 0 ? timedOutCount / total : 0,
                replyRate: delivered > 0 ? repliedCount / delivered : 0,
                failureRate: total > 0 ? failed / total : 0,
                medianLatency,
                count: total
            };
        };

        return {
            overall: processBatch(events),
            last50: processBatch(events.slice(-50)),
            last100: processBatch(events.slice(-100)),
            last24h: processBatch(events.filter(e => now - (e.timestamp_sent || now) < 86400000)),
            totalSent: events.length
        };
    }

    /**
     * Calculates a 0-100 survivability score based on recent performance.
     */
    async calculateSurvivabilityScore(number, activityConfig = {}) {
        const metrics = await this.getAccountMetrics(number);
        if (!metrics) return 100;

        const last100 = metrics.last100;
        const totalSent = metrics.totalSent || 0;

        // If newly started, assign a high base with minor deductions for "training"
        if (totalSent < 50) {
            let trainingDeduction = 0;
            trainingDeduction += (activityConfig.intensity || 1) * 4;
            trainingDeduction += (activityConfig.total || 1) * 3;
            // session and presence are browser-level flags from obfuscated code
            trainingDeduction -= (activityConfig.session || 1) * 2;
            trainingDeduction -= (activityConfig.presence || 1) * 1;

            return Math.max(90, 100 - trainingDeduction);
        }

        if (!last100) return 100;

        // Penalty-based scoring
        let score = 100;

        // 1. Latency Impact (Higher latency = higher stress on account)
        const latencyPenalty = last100.medianLatency / 35000; // Deduct ~1 point per 35s median latency
        score -= latencyPenalty;

        // 2. Failure Rate Impact
        const failurePenalty = Math.max(0, (last100.failureRate - 0.05) * 50); // Sharp drop after 5% failure
        score -= failurePenalty;

        // 3. deliveryRate drop
        const deliveryDrop = Math.max(0, (1.0 - last100.deliveryRate) * 100);
        score -= (deliveryDrop * 0.1);

        // 4. Activity modifiers
        score -= (activityConfig.intensity || 1) * 0.8;
        score -= (activityConfig.total || 1) * 0.5;
        score += (activityConfig.session || 1) * 0.4;
        score += (activityConfig.presence || 1) * 0.3;

        return Math.floor(Math.min(100, Math.max(0, score)));
    }

    /**
     * Returns a status remark based on the score and metrics.
     */
    getRemark(score, metrics) {
        const stats = metrics?.last100 || { deliveryRate: 1, failureRate: 0 };

        if (score >= 90) {
            return 'NOMINAL: Performance metrics within safety bounds.';
        } else if (score >= 75) {
            const dr = Math.round(stats.deliveryRate * 100);
            return `ELEVATED RISK: Delivery rate fluctuating (${dr}%). Monitor account intensity.`;
        } else if (score >= 60) {
            const fr = Math.round(stats.failureRate * 100);
            return `WARNING: High failure rate detected (${fr}%). Delivery suppression suspected.`;
        } else {
            const dr = Math.round(stats.deliveryRate * 100);
            return `CRITICAL: Severe delivery degradation (${dr}%). Account likely restricted/flagged.`;
        }
    }

    /**
     * Establishes a "steady state" baseline for an account's metrics.
     */
    async checkBaseline(number, events) {
        if (this.baselines[number]) return this.baselines[number];

        const accountEvents = events || await this.ledger.getAccountEvents(number);
        const uniqueRecipients = new Set(accountEvents.map(e => e.recipient_id || e.recipientId)).size;

        const firstEventTime = accountEvents.length > 0 ? accountEvents[0].timestamp_sent : Date.now();
        const durationHours = (Date.now() - firstEventTime) / (1000 * 60 * 60);

        // Require 100+ events over 48 hours to establish baseline
        if (accountEvents.length >= 100 && durationHours >= 48 && uniqueRecipients >= 20) {
            const metrics = await this.getAccountMetrics(number);
            this.baselines[number] = {
                baseline_delivery_rate: metrics.overall.deliveryRate,
                baseline_OTR: metrics.overall.otr,
                baseline_latency: metrics.overall.medianLatency,
                establishedAt: Date.now()
            };
            this._saveBaselines();
            return this.baselines[number];
        }
        return null;
    }
}

module.exports = SurvivabilityEngine;