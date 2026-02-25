/**
 * BehaviorEngine simulates human interaction patterns on WhatsApp Web.
 * it handles realistic typing speeds, conversational pauses, and passive presence.
 */
class BehaviorEngine {
    constructor() {
        this.messagePool = [
            "Hey, how's it going?",
            "Did you see the latest update?",
            "Just checking in.",
            "How are things at your end?",
            "Are we still on for later?",
            "Hey there!",
            "I'll get back to you on that.",
            "Did you get my missed call?",
            "Let's catch up soon.",
            "Hope you're having a good day.",
            "Talk to you later.",
            "Interesting...",
            "Sounds good to me.",
            "What do you think?",
            "Checking the schedule now."
        ];

        console.log('[BEHAVIOR] Human-Mimetic Engine initialized with randomized conversational heuristics.');
    }

    /**
     * Picks a random conversational snippet from the pool.
     */
    _getRandomMessage() {
        return this.messagePool[Math.floor(Math.random() * this.messagePool.length)];
    }

    /**
     * Randomized integer utility.
     */
    _randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Performs a full "message sending" sequence with realistic delays.
     */
    async performSequence(page, targetNumber, onLog = console.log) {
        const message = this._getRandomMessage();

        // Normalize target jid
        let jid = targetNumber;
        if (!jid.includes('@')) {
            if (jid.length === 10) jid = '91' + jid;
            jid = jid + '@c.us';
        }

        try {
            onLog('debug', `Opening chat for target: ${jid}`);

            const chat = await page.evaluateHandle(async (target) => {
                return await window.WWebJS.getChatById(target);
            }, jid);

            if (chat) {
                // Initial "reading" pause
                await this._sleep(this._randomInt(3000, 15000));

                onLog('debug', `Viewing chat history with ${targetNumber}...`);
                await chat.evaluate(c => c.open());

                // Focus/Think pause
                await this._sleep(this._randomInt(2000, 8000));

                // Calculate human-like typing speed
                const wpm = this._randomInt(10, 25); // Relaxed typing
                const charDelay = (60000 / wpm) / 5; // Approx ms per char
                const totalTypingTime = Math.floor(message.length * charDelay);

                // Show "typing..." status
                await chat.evaluate(c => c.sendStateTyping());

                onLog('action', `Typing message... (${(totalTypingTime / 1000).toFixed(1)}s at ${wpm} WPM)`);
                await this._sleep(totalTypingTime);

                // Send the message
                await page.evaluate(async (target, msg) => {
                    await window.WWebJS.sendMessage(target, msg);
                }, jid, message);

                onLog('success', `Message sent: "${message}"`);

                // Post-send "lingering"
                await this._sleep(this._randomInt(3000, 5000));

                return { success: true, message };
            } else {
                throw new Error('Chat object not found for target.');
            }
        } catch (err) {
            onLog('error', `Interaction sequence failed for ${targetNumber}: ${err.message}`);
            await this._sleep(2000);
            return { success: false, error: err.message };
        }
    }

    /**
     * Simulates passive activity (scrolling, checking statuses).
     */
    async performPassive(page, onLog = console.log) {
        try {
            onLog('debug', 'Simulating passive usage (scrolling/checking stories)...');

            // Navigate to Status page
            await page.evaluate(() => {
                const statusBtn = document.querySelector('[data-icon="status-v3-unread"]') || document.querySelector('[data-icon="status-v3"]');
                if (statusBtn) statusBtn.click();
            });

            // Stay on passive views for 10-60 seconds
            await this._sleep(this._randomInt(10000, 60000));

            onLog('debug', 'Passive simulation complete.');
            return { success: true, type: 'PASSIVE' };
        } catch (err) {
            onLog('error', `Passive activity failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /**
     * Pause execution.
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = BehaviorEngine;