/**
 * TrustGraph maintains contact interaction realism.
 */
class TrustGraph {
    constructor() {
        this.interactions = new Map(); // contactId -> lastInteractionTime
    }

    /**
     * Selects a safe contact from a list, ensuring we don't spam the same one.
     */
    getSafeContact(allContacts) {
        if (!allContacts || allContacts.length === 0) return null;

        const now = Date.now();
        const COOL_DOWN = 30 * 60 * 1000; // 30 minutes cool down per contact

        const safe = allContacts.filter(cid => {
            const last = this.interactions.get(cid) || 0;
            return (now - last) > COOL_DOWN;
        });

        // If no safe contacts (everyone in cool down), just pick a random one
        const candidates = safe.length > 0 ? safe : allContacts;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    /**
     * Records an interaction with a contact.
     */
    recordInteraction(contactId) {
        this.interactions.set(contactId, Date.now());
    }
}

module.exports = TrustGraph;
