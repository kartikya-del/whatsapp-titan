/**
 * BehaviorEngine executes safe, passive actions to simulate human usage.
 */
class BehaviorEngine {
    constructor() {
        this.selectors = {
            chatList: '#pane-side',
            chatListScrollable: '#pane-side > div:nth-child(1) > div:nth-child(2)',
            chatItems: 'div[role="listitem"]',
            messagesArea: '[data-testid="messages-container"]',
            inputArea: '#main footer div[contenteditable="true"][role="textbox"]',
            activeChatHeader: '#main header div[role="button"]',
            searchInput: 'div[contenteditable="true"][data-testid="search-input"], div[contenteditable="true"][data-tab="3"]'
        };
        this.onActivity = null;
    }

    setActivityCallback(cb) {
        this.onActivity = cb;
    }

    /**
     * Performs a random passive behavior on the page.
     */
    async performRandomBehavior(page, accountId = 'unknown') {
        const actions = [
            this.openRandomChat,
            this.scrollChatList,
            this.scrollChat,
            this.simulateTyping,
            this.idlePause
        ];

        const action = actions[Math.floor(Math.random() * actions.length)];
        console.log(`[BEHAVIOR-${accountId}] 🧬 Action: ${action.name}`);

        try {
            await action.call(this, page);
        } catch (err) {
            console.error(`[BEHAVIOR-${accountId}] ⚠️ Action ${action.name} failed:`, err.message);
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

    async openSpecificChat(page, jid) {
        const ok = await page.evaluate((targetJid) => {
            if (window.Store && window.Store.Chat) {
                const chat = window.Store.Chat.get(targetJid);
                if (chat) {
                    chat.open();
                    return true;
                }
            }
            return false;
        }, jid);

        if (!ok) {
            console.log(`[BEHAVIOR] 🌩️ Opening "${jid}" via URL navigation...`);
            try {
                const pureNumber = jid.split('@')[0];
                await page.goto(`https://web.whatsapp.com/send?phone=${pureNumber}`, { waitUntil: 'networkidle0', timeout: 15000 });
                await new Promise(r => setTimeout(r, 3000));
            } catch (fallbackErr) {
                console.error(`[BEHAVIOR] ❌ URL fallback failed:`, fallbackErr.message);
            }
        }

        // Wait for the active chat header to reflect we are in a chat
        await page.waitForSelector(this.selectors.activeChatHeader, { timeout: 10000 }).catch(() => { });
        await this.idlePause(page, 2000, 4000);
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

    async performPeerMessage(page, targetJid, texts, accountId = 'unknown') {
        try {
            // 1. Force Open Chat via Store & Click (Double reliability)
            await page.evaluate((jid) => {
                if (window.Store && window.Store.Chat) {
                    const chat = window.Store.Chat.get(jid);
                    if (chat) chat.open();
                }
            }, targetJid);

            // Wait for input area to be ready
            const inputSelector = `#main footer div[contenteditable="true"][role="textbox"], #main div[contenteditable="true"][data-testid="conversation-text-input"], [data-testid="conversation-text-input"]`;
            await page.waitForSelector(inputSelector, { timeout: 15000 }).catch(() => { });
            await this.idlePause(page, 1500, 3000);

            const input = await page.$(inputSelector);
            if (!input) {
                console.error(`[BEHAVIOR-${accountId}] ❌ Failed to find input area for P2P after opening.`);
                return false;
            }

            // Convince the browser we are humanly focusing without popping window
            await input.click().catch(() => { });
            await page.evaluate((sel) => {
                const el = document.querySelector(sel);
                if (el) el.focus();
            }, inputSelector);
            await this.idlePause(page, 500, 1000);

            // 2. Handle Bursting (Humans send 2-3 messages in a row)
            const bursts = Array.isArray(texts) ? texts : [texts];

            for (let i = 0; i < bursts.length; i++) {
                const message = bursts[i];
                console.log(`[BEHAVIOR-${accountId}] 🖋️ Typing burst ${i + 1}/${bursts.length}: "${message.substring(0, 20)}..."`);

                await input.focus();
                for (const char of message) {
                    await page.keyboard.sendCharacter(char);
                    await new Promise(r => setTimeout(r, 60 + Math.random() * 120));
                }

                await new Promise(r => setTimeout(r, 400 + Math.random() * 800));
                await page.keyboard.press('Enter');

                // Small pause between multiple messages in a burst
                if (i < bursts.length - 1) {
                    await this.idlePause(page, 2000, 5000);
                }
            }

            return true;
        } catch (err) {
            console.error(`[BEHAVIOR-${accountId}] ⚠️ P2P Message Fail:`, err.message);
        }
        return false;
    }

    async idlePause(page, min = 3000, max = 15000) {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        await new Promise(r => setTimeout(r, delay));
    }
}

module.exports = BehaviorEngine;
