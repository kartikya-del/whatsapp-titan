# 🏆 WhatsApp Titan: The Feature Bible

This document serves as the "Master Manual" for the WhatsApp Titan Operators. It details every capability, safety mechanism, and workflow built into the final locked-down version of the software.

---

## 1. 🔐 Account & Connection Management
The foundation of the system.
- **Multi-Account Registry:** Add and manage unlimited WhatsApp accounts. The system remembers session data (cookies/tokens) so you don't need to scan QR codes every time.
- **Titan Tab Guard:** A background watchdog that detects if a WhatsApp Web tab is opened twice (which causes disconnection). It aggressively closes duplicate tabs to ensure connection stability.
- **Stealth Browser:** Uses advanced browser fingerprinting to masquerade as a legitimate Google Chrome user on Windows, avoiding automated detection flags.

## 2. 💎 Extraction Engine
Powerful tools to scrape and organize contacts.
- **Smart Group Discovery:** Fetches the complete list of groups from the connected phone.
- **"Select All" Logic:** 
    - **Context-Aware:** If you search for "Marketing" and click "Select All", it selects *only* the filtered "Marketing" groups, not your entire list.
    - **Freshness Guarantee:** Always fetches the latest data from the phone before selecting, ensuring no errors even if groups changed recently.
- **Contact Cleaner:** 
    - **Wipe Invalids:** Automatically removes numbers that are too short (<10 digits) or too long (>12 digits).
    - **Wipe Admins:** One-click removal of Group Admins (useful for avoiding angry group owners).
- **Duplicate Protection:** Automatically prevents the same phone number from appearing twice in your list, even if they are in multiple groups.

## 3. 🚀 The Sending Engine (Titan Quantum)
The core messaging system designed for safety and deliverability.
- **Quantum Delay Timing:** 
    - Unlike basic bots that send every X seconds, Titan uses **Randomized Intervals** (e.g., 42s, then 15s, then 89s).
    - **Human Jitter:** Adds micro-delays to simulate human thinking time.
- **Biological Simulation:** 
    - **Read Receipts:** The bot opens the chat and triggers "Blue Ticks" before sending.
    - **Typing Simulation:** It mimics typing speed based on message length before hitting send.
- **Staggered Launch:** When running multiple accounts, they don't start simultaneously. They "wake up" in a staggered sequence to avoid creating a traffic spike pattern.
- **Media Handling:** Supports Text-Only, Image/Video-Only, or Text-First/Media-First hybrid modes.

## 4. 🛡️ The "Iron Dome" (Safety & Reliability)
Features designed to survive real-world chaos.
- **⚡ Power-Cut Proof (Session Persistence):** 
    - **Continuous Save:** Every single message sent is recorded to the hard drive immediately.
    - **Auto-Recovery:** If your PC crashes or loses power, the app detects the interrupted session on restart. A "Session Restored" prompt allows you to **Resume** exactly where you left off. nothing is lost.
- **📶 Network Guard (Wi-Fi Protection):** 
    - **Auto-Pause:** If the internet connection drops, the system detects the timeout.
    - **Safety Stop:** Instead of marking leads as "Failed", it **Pauses** the campaign.
    - **No Data Loss:** Once you reconnect, you click "Resume" and it retries the dropped contacts.
- **Global Error Shield:** Catches internal software crashes (JavaScript errors) and suppresses them to keep the UI responsive, preventing the "White Screen of death".

## 5. 🧠 Campaign Intelligence
- **Single Campaign Mode:** A focused, "Draft" based workflow. You work on one active campaign at a time to ensure quality control.
- **Variant A/B Testing:**
    - Create multiple message versions (Variant A, Variant B).
    - The system rotates them per contact.
    - **Performance Matrix:** Tracks which variant gets more replies in the Analytics tab.
- **History Archive:** 
    - Every run is archived. Even if you restart a campaign, the old data (Sent/Replied counts) is permanently saved to the "Lifetime Stats".

## 6. 🤖 Contextual Auto-Reply
A smart responder that acts like a human assistant.
- **Privacy Filter:** Only replies to people *this software* messaged. Ignores your personal friends/family unless configured otherwise.
- **Human Takeover:** If you reply to a contact manually from your phone, the Bot detects your intervention and **Permanently Mutes** itself for that conversation. It knows you are handling it.
- **Keyword Matching:** Can be trained to reply with specific info (e.g., "Price List") when keywords are detected.
- **Anti-Echo:** Smart enough to ignore its own messages or messages from other workers in the swarm.

## 7. 📊 Data Export
- **Merged Export:** Download all contacts into one master Excel file.
- **Split Export:** Download contacts separated into different files based on which Group they came from.
- **Admin Export:** Generate a specific list of Group Admins (high-value targets).

---
**Status:** 🔒 LOCKED & VERIFIED
**Version:** Titan v2.1 (Production Ready)
