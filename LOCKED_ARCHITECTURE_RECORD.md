# 🔒 LOCKED ARCHITECTURE RECORD
**Project:** WhatsApp Extractor & Auto-Reply
**Status:** FINALIZED & LOCKED (Jan 29, 2026)

## 🤖 1. Auto-Reply Engine (Guardian Protocol - FINAL V2)
- **Privacy Shield:** Strictly ignores all messages from non-campaign numbers. Personal chats are invisible to the bot.
- **Engagement Window:** 48-hour hard limit. Bot only responds to leads messaged in the last 2 days.
- **Permanent Human Takeover:** Any manual message from the user permanently disables the bot for that thread (No override).
- **Sequential Processing (Focus Lock):** Bot only focuses on ONE chat at a time. No parallel typing to multiple people.
- **Biological Simulation:**
  - **Reaction Delay:** Random 1-5 minutes before opening chat (Seen).
  - **Transition Gap:** Random 10-60 seconds cooldown between switching chat threads.
  - **Reading/Typing:** Simulated reading time (2-4s) and dynamic typing speed based on message length.
- **Intent Memory:** "Smart Mode" - Bot only triggers a specific keyword group ONCE per lead to prevent loops.
- **Safety Cap:** Hard limit of 5 automated messages per lead.
- **Terminal Priority:** Clean conversion feed showing only First Client Reply and Manual Takeovers.

## 🛡️ 2. Core Lead Extractor (3-Pipeline)
- **Pipeline A (Discovery):** Finite one-pass scan of all group names and IDs.
- **Pipeline B (Metadata):** Background batch processing (50 groups/batch) for participant counting.
- **Pipeline C (Extraction):** Surgical lead extraction with `registry` state saving and resume capability. Ensures 0 duplicate leads.

## 📡 3. Sending Tools (Surgical Sequence)
- **Methodology:** Multi-layered fallback including `sendMessage`, WWebJS Proxy, and direct Store-level injections.
- **Media:** Caption-aware media handling to prevent protocol-level crashes.

## 🎨 4. UI Stability (Titan Focus)
- **Feature:** Prevents input interruption by restoring `activeElement` ID and `selectionRange` instantly after renders.

## 📁 5. LOCKED MODULES (FILES) - DO NOT TOUCH
The following files are verified, functional, and under **TRIPLE-CONFIRMATION LOCK**.
- `engine/AccountRegistry.js`
- `engine/ExtractionManager.js`
- `engine/ExtractionWorker.js`
- `engine/whatsappLogin.js`
- `electron/main.js` 
- `renderer/app.js`

---
**⚠️ CRITICAL PROTOCOL:** These modules are finalized. Do NOT modify these files for any reason without asking the USER exactly three (3) times and receiving affirmative consent each time. 

**END OF RECORD - VERSION 2.1 - LOCKED**
