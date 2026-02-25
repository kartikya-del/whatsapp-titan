/**
 * CircadianEngine simulates human activity rhythms over a 24-hour period.
 * It provides multipliers to adjust the intensity of automated warming/outreach tasks.
 */
class CircadianEngine {
    constructor() {
        this.activeHours = {
            start: 10, // 10:00 AM
            end: 19    // 07:00 PM
        };
    }

    /**
     * Calculates an activity score multiplier (0.0 - 1.2) based on current local time.
     */
    getCurrentMultiplier() {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const decimalHour = hour + (minute / 60);

        // 1. Outside active window (Night/Early morning)
        if (decimalHour < this.activeHours.start || decimalHour >= this.activeHours.end) {
            return decimalHour < 7 || decimalHour > 22 ? 0.1 : 0.2;
        }

        // 2. Morning Ramp-up (10:00 - 10:30)
        if (decimalHour >= 10.0 && decimalHour < 10.5) return 0.6;

        // 3. Morning Peak (10:30 - 12:30)
        if (decimalHour >= 10.5 && decimalHour < 12.5) return 1.0;

        // 4. Pre-Lunch (12:30 - 13:00)
        if (decimalHour >= 12.5 && decimalHour < 13.0) return 0.8;

        // 5. Lunch Dip (13:00 - 14:30)
        if (decimalHour >= 13.0 && decimalHour < 14.5) return 0.4;

        // 6. Afternoon Recovery (14:30 - 16:00)
        if (decimalHour >= 14.5 && decimalHour < 16.0) return 0.8;

        // 7. Late Afternoon Peak (16:00 - 18:30)
        if (decimalHour >= 16.0 && decimalHour < 18.5) return 1.2;

        // 8. Evening Wind-down (18:30 - 19:00)
        if (decimalHour >= 18.5 && decimalHour < 19.0) return 0.5;

        return 0.1;
    }

    /**
     * Probabilistically determines if a new session should start now based on multiplier.
     */
    isCurrentSessionEligible() {
        const multiplier = this.getCurrentMultiplier();
        if (multiplier <= 0) return false;

        const baseProb = 0.15;
        return Math.random() < (baseProb * multiplier);
    }
}

module.exports = CircadianEngine;