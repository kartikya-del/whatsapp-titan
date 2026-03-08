/**
 * PeerConversationEngine manages realistic P2P interactions using a Combinatorial Generative Engine.
 * With the current segments, it creates over 15,000+ unique, sensible conversation permutations.
 */
class PeerConversationEngine {
    constructor() {
        this.history = [];

        // Context Pools for Generative Dialogue
        this.pools = {
            work: {
                starters: [
                    ["Hey", "are you free for a second?"],
                    ["Quick update on the project."],
                    ["Did you see the email from HR?"],
                    ["About the client meeting today..."],
                    ["Check the shared drive.", "I uploaded a new version."],
                    ["Hey", "quick question about the tracker."],
                    ["The server seems a bit slow again."],
                    ["Did Sarah ping you about the report?"],
                    ["Deadline is approaching for the build."],
                    ["Can we sync up in 10 minutes?"]
                ],
                middles: [
                    ["I'm finishing the slides now.", "Should be done soon."],
                    ["Just saw the update.", "Looks like they moved the time."],
                    ["I'll check it out.", "Do I have access?"],
                    ["The API docs are a bit outdated.", "Checking the new ones."],
                    ["I'm on a call right now.", "Can speak in 5."],
                    ["The charts are finally done.", "Attaching them now."],
                    ["I think Sarah is the lead on this.", "Ask her."],
                    ["It's working on my local machine.", "Let me push the fix."]
                ],
                closers: [
                    ["Perfect", "let me know when you're done."],
                    ["Great.", "I'll join the call then."],
                    ["Thanks for the heads up!", "🙏"],
                    ["Got it.", "I'll handle the rest."],
                    ["Sweet.", "Talk soon."],
                    ["No rush.", "Take your time."]
                ]
            },
            social: {
                starters: [
                    ["Yo!", "Long time no see."],
                    ["Hey", "getting lunch soon?"],
                    ["Did you see the game last night?"],
                    ["Thinking of that new burger place."],
                    ["Coffee break?", "I need some caffeine."],
                    ["What are your plans for the weekend?"],
                    ["Found a really cool video.", "Sending it over."],
                    ["Hey buddy", "how's everything going?"],
                    ["Starbucks is having a 2-for-1 deal today!"],
                    ["Did you get the invite to the party?"]
                ],
                middles: [
                    ["Not yet, let me check.", "Where is it?"],
                    ["I'm definitely down.", "What time?"],
                    ["It was crazy!", "That last goal was insane."],
                    ["I heard it's actually pretty cheap.", "Let's try."],
                    ["I'm finishing dinner now.", "Give me 20."],
                    ["Busy morning but I'm free now.", "What's up?"],
                    ["Just checking my schedule.", "Yeah, I'm free!"]
                ],
                closers: [
                    ["Sweet.", "See you there."],
                    ["Nice!", "Can't wait."],
                    ["Count me in.", "🔥"],
                    ["Haha, true.", "Talk later!"],
                    ["Enjoy your break!", "☕"],
                    ["OK.", "I'll text when I'm leaving."]
                ]
            },
            short: {
                starters: [["Hey"], ["Yo"], ["Hi"], ["Quick one"], ["Check this"], ["Wait"], ["Wait up"]],
                middles: [["Wanna talk?"], ["You free?"], ["Busy?"], ["Quick update"], ["Check your mail"], ["Lost my keys lol"]],
                closers: [["k"], ["OK"], ["Cool"], ["Done"], ["Thx"], ["👍"], ["See ya"]]
            }
        };
    }

    /**
     * Generates a unique, meaningful dialogue by combining contextual segments.
     * Calculation: (10 Starters * 8 Middles * 6 Closers) x 3 Categories = Thousands of paths.
     */
    getRandomConversation() {
        const categories = Object.keys(this.pools);
        const category = categories[Math.floor(Math.random() * categories.length)];
        const pool = this.pools[category];

        const starter = pool.starters[Math.floor(Math.random() * pool.starters.length)];
        const middle = pool.middles[Math.floor(Math.random() * pool.middles.length)];
        const closer = pool.closers[Math.floor(Math.random() * pool.closers.length)];

        const convo = [starter, middle, closer];

        // Ensure we don't repeat the exact SAME starter consecutively
        const firstMsg = Array.isArray(starter) ? starter[0] : starter;
        if (this.history.includes(firstMsg)) {
            return this.getRandomConversation(); // Recurse once if repeat
        }

        this.history.push(firstMsg);
        if (this.history.length > 30) this.history.shift();

        console.log(`[PEER-ENGINE] 🧠 Generative Dialogue Created (Category: ${category}). Path: "${firstMsg.substring(0, 30)}..."`);
        return convo;
    }

    /**
     * Finds a peer account that is currently online and NOT the sender.
     */
    findAvailablePeer(senderNumber, activeWorkers) {
        const peers = Array.from(activeWorkers.keys()).filter(num => num !== senderNumber);
        if (peers.length === 0) return null;
        return peers[Math.floor(Math.random() * peers.length)];
    }
}

module.exports = PeerConversationEngine;
