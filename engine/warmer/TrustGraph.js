/**
 * TrustGraph maintains a map of relationships between accounts.
 * It tracks interaction frequency and "trust weights" to prioritize 
 * warming routines that simulate natural network behavior.
 */
class TrustGraph {
    constructor(store) {
        this.store = store;
        this.graph = this.store.getTrustGraph(); // { nodes: {}, edges: {} }
        this._ensureStructure();
    }

    /**
     * Initializes base graph structure if missing.
     */
    _ensureStructure() {
        if (!this.graph.edges) this.graph.edges = {};
        if (!this.graph.nodes) this.graph.nodes = {};
    }

    /**
     * Adds an array of phone numbers to the trust graph nodes.
     */
    registerAccounts(numbers) {
        let changed = false;
        numbers.forEach(num => {
            if (!this.graph.nodes[num]) {
                this.graph.nodes[num] = {
                    trustScore: 0.5,
                    activeSince: Date.now(),
                    totalInteractions: 0
                };
                changed = true;
            }
        });

        if (changed) this._persist();
    }

    /**
     * Returns a trust score (0-1) for a specific account.
     */
    getTrustScore(number) {
        return this.graph.nodes[number]?.trustScore || 0;
    }

    /**
     * Recommends a warming partner (target) for a source account.
     */
    pickWarmingTarget(sourceNumber, availableNumbers) {
        const pool = availableNumbers.filter(n => n !== sourceNumber);
        if (pool.length === 0) return { type: 'IDLE', target: null };

        // 1. Roll for interaction strategy
        const roll = Math.random();
        let strategy = 'COOPERATIVE'; // Strengthen existing bond

        if (roll < 0.1) strategy = 'EXPLORATORY';   // New relationship
        else if (roll < 0.3) strategy = 'MAINTENANCE'; // Neglected relationship

        // 2. Select based on weights
        const sourceEdges = this.graph.edges[sourceNumber] || {};
        let totalWeight = 0;

        const prospects = pool.map(num => {
            // Base weight depends on strategy
            let weight = sourceEdges[num] ? sourceEdges[num].weight : 0.1;

            if (strategy === 'EXPLORATORY' && !sourceEdges[num]) weight = 1.0;
            if (strategy === 'MAINTENANCE' && sourceEdges[num] && weight < 0.3) weight = 1.0;

            totalWeight += weight;
            return { peer: num, weight };
        });

        if (totalWeight <= 0) return { type: 'RANDOM', target: pool[0] };

        // Weighted random pick
        let cursor = Math.random() * totalWeight;
        let chosen = null;

        for (const p of prospects) {
            cursor -= p.weight;
            if (cursor <= 0) {
                chosen = p.peer;
                break;
            }
        }

        if (!chosen) chosen = prospects[prospects.length - 1].peer;

        return { type: strategy, target: chosen };
    }

    /**
     * Records a successful warming interaction between two internal accounts.
     */
    recordInteraction(source, target) {
        if (!this.graph.edges[source]) this.graph.edges[source] = {};

        if (!this.graph.edges[source][target]) {
            this.graph.edges[source][target] = {
                weight: 0.1,
                lastInteraction: 0,
                count: 0
            };
        }

        const edge = this.graph.edges[source][target];

        // Strengthen edge
        edge.weight = Math.min(1.0, edge.weight + 0.05);
        edge.lastInteraction = Date.now();
        edge.count++;

        // Decay other outgoing edges from this source (simulate focus shift)
        Object.keys(this.graph.edges[source]).forEach(peer => {
            if (peer !== target) {
                this.graph.edges[source][peer].weight *= 0.98;
            }
        });

        // Update node metrics
        if (this.graph.nodes[source]) {
            this.graph.nodes[source].totalInteractions++;
            this.graph.nodes[source].lastActiveAt = Date.now();
        }

        this._persist();
    }

    /**
     * Persists the current graph state via the StateStore.
     */
    _persist() {
        this.store.saveTrustGraph(this.graph);
    }
}

module.exports = TrustGraph;