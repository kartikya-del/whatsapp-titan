/**
 * SessionEngine maintains session realism and prevents timeouts.
 */
class SessionEngine {
    /**
     * Ensures the WhatsApp tab is focused and prevents idle timeout.
     */
    async ensureActive(page) {
        if (!page || page.isClosed()) return false;

        try {
            // Restore focus if lost
            await page.bringToFront();

            // Verify connection alive (check if a common element exists)
            const isAlive = await page.evaluate(() => {
                return !!document.querySelector('#app');
            });

            if (!isAlive) return false;

            // Simulate slight mouse jitter to reset internal idle timers
            await page.mouse.move(Math.random() * 100, Math.random() * 100);

            return true;
        } catch (e) {
            console.error('[SESSION-ENGINE] Activity check failed:', e.message);
            return false;
        }
    }
}

module.exports = SessionEngine;
