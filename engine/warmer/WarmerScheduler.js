const EventEmitter = require('events');

/**
 * WarmerScheduler manages the timing of warming cycles.
 * It uses a jittered polling approach combined with circadian eligibility
 * to trigger warming tasks at natural-looking intervals.
 */
class WarmerScheduler extends EventEmitter {
    constructor(store, circadian) {
        super();
        this.store = store;
        this.circadian = circadian;
        this.isRunning = false;
        this.nextTickTimer = null;
    }

    /**
     * Starts the scheduler.
     */
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this._scheduleNextTick();
    }

    /**
     * Stops the scheduler.
     */
    stop() {
        this.isRunning = false;
        if (this.nextTickTimer) {
            clearTimeout(this.nextTickTimer);
        }
    }

    /**
     * Schedules the next recurring tick with random jitter.
     */
    _scheduleNextTick() {
        if (!this.isRunning) return;

        // Base interval between 30 seconds and 3 minutes
        const minMs = 30000;
        const maxMs = 180000;
        const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

        this.nextTickTimer = setTimeout(() => {
            this._tick();
        }, delay);
    }

    /**
     * Evaluates if a warming session should trigger right now.
     */
    async _tick() {
        if (!this.isRunning) return;

        const isEligible = this.circadian.isCurrentSessionEligible();
        if (!isEligible) {
            // Wait for next cycle
            this._scheduleNextTick();
            return;
        }

        // Trigger warming event
        this.emit('tick');

        // Re-schedule
        this._scheduleNextTick();
    }
}

module.exports = WarmerScheduler;