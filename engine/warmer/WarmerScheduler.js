/**
 * WarmerScheduler determines delay between behaviors based on circadian intensity.
 */
class WarmerScheduler {
    constructor(circadianEngine) {
        this.circadian = circadianEngine;
    }

    /**
     * Calculates the next delay in milliseconds.
     * baseDelay = random(30s, 180s)
     * finalDelay = baseDelay / activityLevel
     */
    getNextDelay() {
        const activityLevel = this.circadian.getActivityLevel();

        // Randomized jitter
        const baseDelaySec = Math.floor(Math.random() * (180 - 30 + 1)) + 30;
        const baseDelayMs = baseDelaySec * 1000;

        // TITAN TEST MODE: Biological scaling disabled.
        const finalDelay = baseDelayMs; // / effectiveLevel;

        return Math.floor(finalDelay);
    }
}

module.exports = WarmerScheduler;
