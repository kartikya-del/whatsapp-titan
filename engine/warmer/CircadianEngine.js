/**
 * CircadianEngine implements realistic human activity intensity based on time of day.
 */
class CircadianEngine {
    constructor() {
        /**
         * Activity multiplier curve:
         * 00:00–06:00 → 0.05 (Sleeping)
         * 06:00–09:00 → 0.4  (Waking up)
         * 09:00–13:00 → 0.8  (Work morning)
         * 13:00–17:00 → 1.0  (Peak activity)
         * 17:00–21:00 → 0.9  (Evening usage)
         * 21:00–00:00 → 0.5  (Winding down)
         */
        this.curve = {
            0: 0.05, 1: 0.05, 2: 0.05, 3: 0.05, 4: 0.05, 5: 0.05,
            6: 0.4, 7: 0.4, 8: 0.4,
            9: 0.8, 10: 0.8, 11: 0.8, 12: 0.8,
            13: 1.0, 14: 1.0, 15: 1.0, 16: 1.0,
            17: 0.9, 18: 0.9, 19: 0.9, 20: 0.9,
            21: 0.5, 22: 0.5, 23: 0.5
        };
    }

    /**
     * Returns the current activity multiplier based on the current hour.
     */
    getActivityLevel() {
        const hour = new Date().getHours();
        return this.curve[hour] || 0.5;
    }
}

module.exports = CircadianEngine;
