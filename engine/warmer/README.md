# LeadTitan Trust Building Engine (Number Warmer)

This module implements a production-grade behavioral simulation engine designed to mimic authentic human WhatsApp usage patterns. By generating realistic session-based activity, it increases account trust scores and reduces ban probability.

## 🧠 Architecture Overview

The system is built on **6 Core Pillars**:

1.  **`WarmerManager.js` (Director)**
    *   Orchestrates the entire system.
    *   Enforces global concurrency limits (Max 3 sessions).
    *   Manages stochastic daily targets per account.

2.  **`CircadianEngine.js` (Clock)**
    *   Implements a probability curve for activity based on human hours (10 AM - 7 PM).
    *   Simulates "Morning Ramp-up", "Lunch Dip", and "Afternoon Peak".

3.  **`SessionEngine.js` (Lifecycle)**
    *   Controls browser session duration (2-15 mins).
    *   Executes clusters of actions (Read -> Type -> Scroll -> Close).
    *   Maintains "Presence" to signal active usage.

4.  **`TrustGraph.js` (Social Network)**
    *   Maintains a weighted graph of account relationships.
    *   Enforces diversity: **70% Internal Messaging**, **20% Passive**, **10% Idle**.
    *   Prevents "Bot Loops" by evolving weights over time.

5.  **`BehaviorEngine.js` (Actor)**
    *   Executes biological workflows (Typing Speed 50-150ms/char).
    *   Injects "Noise" (passive actions).

6.  **`StateStore.js` (Memory)**
    *   Persists all behavioral data to disk (JSON).
    *   Crash-Safe and Resume-Safe.

## 🚀 Integration Guide

To activate the engine:

```javascript
const WarmerManager = require('./engine/warmer/WarmerManager');

// Assuming you have an initialized ExtractionManager
const warmer = new WarmerManager(manager); 

// Start the background process
warmer.start();
```

## ⚙️ Configuration

The system is zero-configuration by default but respects `userData` directory for state persistence.

- **State Directory:** `userData/warmer/`
- **Behavioral State:** `trust_graph.json`
- **Operational State:** `daily_counts.json`

## 🛡️ Safety Features

- **Concurrency Limit:** Max 3 active sessions globally.
- **Daily Caps:** Stochastic limits (15-40 msgs/day) per account.
- **Sleep Mode:** Automatically sleeps outside 10 AM - 7 PM.
- **Profile Stability:** Uses dedicated Chrome profiles via ExtractionManager.

## 📊 Monitoring

Logs are output to the standard console with `[WarmerManager]`, `[SessionEngine]`, etc. prefixes.
