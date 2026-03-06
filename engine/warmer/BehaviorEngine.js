/**
 * BehaviorEngine executes safe, passive actions to simulate human usage.
 */
class BehaviorEngine {
    constructor() {
        this.selectors = {
            chatList: '#pane-side',
            chatItems: 'div[role="listitem"]',
            messagesArea: '[data-testid="messages-container"]',
            inputArea: 'div[contenteditable="true"]',
            activeChatHeader: 'header div[role="button"]'
        };
        this.onActivity = null;
    }

    setActivityCallback(cb) {
        this.onActivity = cb;
    }

    /**
     * Performs a random passive behavior on the page.
     */
    async performRandomBehavior(page) {
        const actions = [
            this.openRandomChat,
            this.scrollChatList,
            this.scrollChat,
            this.simulateTyping,
            this.idlePause
        ];

        const action = actions[Math.floor(Math.random() * actions.length)];
        console.log(`[BEHAVIOR] Simulation: ${action.name}`);

        try {
            await action.call(this, page);
        } catch (err) {
            console.error(`[BEHAVIOR] Action ${action.name} failed:`, err.message);
        }
    }

    async openRandomChat(page) {
        const chats = await page.$$(this.selectors.chatItems);
        if (chats.length > 0) {
            const targetIndex = Math.floor(Math.random() * Math.min(chats.length, 15));
            const chat = chats[targetIndex];

            // Try to extract JID/ID for TrustGraph
            const chatId = await page.evaluate(el => {
                // Heuristic: check data-testid or title
                return el.getAttribute('data-testid') || el.innerText.split('\n')[0];
            }, chat);

            await chat.click();

            if (this.onActivity && chatId) {
                this.onActivity('INTERACTION', { chatId });
            }

            await this.idlePause(page, 1500, 3000);
        }
    }

    async scrollChatList(page) {
        const chatList = await page.$(this.selectors.chatList);
        if (chatList) {
            const scrollAmount = Math.floor(Math.random() * 800) - 400;
            await page.evaluate((el, amount) => {
                el.scrollBy({ top: amount, behavior: 'smooth' });
            }, chatList, scrollAmount);
        }
    }

    async scrollChat(page) {
        const messagesArea = await page.$(this.selectors.messagesArea);
        if (messagesArea) {
            const scrollAmount = Math.floor(Math.random() * 1200) - 600;
            await page.evaluate((el, amount) => {
                el.scrollBy({ top: amount, behavior: 'smooth' });
            }, messagesArea, scrollAmount);
        }
    }

    async simulateTyping(page) {
        const input = await page.$(this.selectors.inputArea);
        if (input) {
            await input.focus();

            const length = Math.floor(Math.random() * 30) + 10;
            const dummyText = "just checking back on the status of that group";
            const finalLength = Math.min(length, dummyText.length);

            const minDelay = 150;
            const maxDelay = 340;

            for (let i = 0; i < finalLength; i++) {
                const char = dummyText[i] || ' ';
                await page.keyboard.sendCharacter(char);
                const jitter = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
                await new Promise(r => setTimeout(r, jitter));
                if (Math.random() > 0.95) await new Promise(r => setTimeout(r, 2000));
            }

            await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

            for (let i = 0; i < finalLength; i++) {
                await page.keyboard.press('Backspace');
                await new Promise(r => setTimeout(r, 40 + Math.random() * 40));
            }
        }
    }

    async idlePause(page, min = 3000, max = 15000) {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        await new Promise(r => setTimeout(r, delay));
    }
}

module.exports = BehaviorEngine;
