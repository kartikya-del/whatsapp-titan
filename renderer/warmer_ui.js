
window.WarmerUI = {
    _state: null,
    _container: null,
    _pendingToggle: false,
    _toggleTimeout: null,

    // Initial Render Scaffolding
    render: function (container) {
        this._container = container;
        container.innerHTML = `
            <div class="warmer-dashboard animate-in">
                <!-- 1. Global Engine Header -->
                <div class="warmer-header">
                    <div class="warmer-title">
                        <h2>
                            Account Warm-Up
                            <span id="warmer-global-badge" class="warmer-badge badge-idle">Initializing...</span>
                        </h2>
                        <div style="display:flex; gap:20px; margin-top:8px;">
                            <div class="metric-sub">
                                <span style="width:6px; height:6px; background:#3b82f6; border-radius:50%;"></span>
                                <span id="header-active-sessions">-- / 3 Active</span>
                            </div>
                            <div class="metric-sub">
                                <span style="width:6px; height:6px; background:#10b981; border-radius:50%;"></span>
                                <span id="header-multiplier">Multiplier: --x</span>
                            </div>
                        </div>
                    </div>
                    
                    <label class="toggle-switch">
                        <input type="checkbox" id="warmer-toggle-btn">
                        <span class="slider">
                            <span class="knob"></span>
                        </span>
                    </label>
                </div>

                <!-- Suggestion Banner -->
                <div id="warmer-suggestion-banner" style="display:none; background:#eff6ff; border:1px solid #bfdbfe; border-radius:12px; padding:14px 20px; margin-bottom:20px; align-items:center; gap:14px;">
                    <span style="font-size:20px;">💡</span>
                    <div style="font-size:13px; color:#1e40af; font-weight:600;">For best results, connect at least 2 WhatsApp accounts. The warmer simulates real conversations between your accounts to build trust and reduce ban risk.</div>
                </div>

                <!-- 2. Behavioral Metrics Grid -->
                <div class="warmer-metrics-grid">
                    <div class="metric-card">
                        <div class="metric-label">Warming Now</div>
                        <div class="metric-value" id="metric-sessions-val">--</div>
                        <div class="metric-sub" id="metric-sessions-sub">--% utilization</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Health Score</div>
                        <div class="metric-value" id="metric-trust-val" style="color:#10b981;">--</div>
                        <div class="metric-sub">Account Safety</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Randomness</div>
                        <div class="metric-value" id="metric-entropy-val" style="color:#8b5cf6;">--%</div>
                        <div class="metric-sub">Pattern Variation</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Schedule</div>
                        <div class="metric-value" id="metric-circadian-val" style="font-size:18px;">--</div>
                        <div class="metric-sub" id="metric-circadian-sub">Multiplier: --x</div>
                    </div>
                </div>

                <!-- 3. Split View: Accounts & Feed -->
                <div class="warmer-split-view">
                    <!-- Left: Account Grid -->
                    <div>
                        <div class="feed-header" style="background:transparent; border:none; padding-left:0; margin-bottom:12px; color:#64748b;">
                            YOUR ACCOUNTS
                        </div>
                        <div id="warmer-account-grid" class="account-grid">
                            <!-- Cards injected here -->
                            <div style="text-align:center; padding:40px; color:#94a3b8;">Connecting to fleet...</div>
                        </div>
                    </div>

                    <!-- Right: Live Feed -->
                    <div class="activity-feed-card">
                        <div class="feed-header" style="display:flex; justify-content:space-between;">
                            <span>ACTIVITY LOG</span>
                            <span style="font-size:10px; background:#ecfdf5; color:#059669; padding:2px 6px; border-radius:4px;">REALTIME</span>
                        </div>
                        <div id="warmer-activity-feed" class="feed-content">
                            <!-- Feed items injected here -->
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Bind Controls
        const toggle = document.getElementById('warmer-toggle-btn');
        if (toggle) {
            toggle.onchange = (e) => {
                const newState = e.target.checked;

                // Optimistic Update
                this._pendingToggle = true;
                if (this._toggleTimeout) clearTimeout(this._toggleTimeout);
                this._toggleTimeout = setTimeout(() => { this._pendingToggle = false; }, 2000);

                window.api.toggleWarmer(newState);
            };
        }
    },

    // Efficient Update Loop
    update: function (state) {
        if (!state) return;
        this._state = state;

        const { isRunning, activeCount, circadianMultiplier, circadianState, accounts, recentActivity } = state;

        // 1. Header Updates
        const badge = document.getElementById('warmer-global-badge');
        const toggle = document.getElementById('warmer-toggle-btn');

        if (badge) {
            if (!isRunning) {
                badge.className = 'warmer-badge badge-idle';
                badge.innerHTML = '🛑 PAUSED';
                badge.style.background = '#fef2f2'; badge.style.color = '#ef4444'; badge.style.border = '1px solid #fee2e2';
            } else if (activeCount > 0) {
                badge.className = 'warmer-badge badge-running';
                badge.innerHTML = 'Running';
                badge.style.background = ''; badge.style.color = ''; badge.style.border = '';
            } else {
                badge.className = 'warmer-badge badge-idle';
                badge.innerHTML = '💤 Idle (Waiting)';
                badge.style.background = '#eff6ff'; badge.style.color = '#3b82f6'; badge.style.border = '1px solid #dbeafe';
            }
        }

        // ONLY update toggle if user isn't interacting
        if (toggle && !this._pendingToggle) {
            toggle.checked = !!isRunning;
            if (!!isRunning) toggle.setAttribute('checked', 'true');
            else toggle.removeAttribute('checked');
        }

        // Show/hide suggestion banner based on connected accounts
        const suggestionBanner = document.getElementById('warmer-suggestion-banner');
        const connectedCount = state.connectedCount || 0;
        if (suggestionBanner) {
            suggestionBanner.style.display = connectedCount < 2 ? 'flex' : 'none';
        }

        this._setText('header-active-sessions', `${activeCount} / 3 Active`);
        this._setText('header-multiplier', `Multiplier: ${circadianMultiplier}x`);

        // 2. Metrics Updates
        this._setText('metric-sessions-val', activeCount);
        this._setText('metric-sessions-sub', `${Math.round((activeCount / 3) * 100)}% utilization`);

        // FIX: Remove *100 as calculation is already 0-100
        const avgTrust = accounts.length ? (accounts.reduce((acc, a) => acc + parseFloat(a.trustScore || 0), 0) / accounts.length).toFixed(0) : '0';
        this._setText('metric-trust-val', avgTrust);

        const avgEntropy = accounts.length ? (accounts.reduce((acc, a) => acc + parseFloat(a.entropyScore || 0), 0) / accounts.length).toFixed(0) : '0';
        this._setText('metric-entropy-val', `${avgEntropy}%`);

        this._setText('metric-circadian-val', circadianState || 'Normal');
        this._setText('metric-circadian-sub', `Multiplier: ${circadianMultiplier}x`);

        // 3. Render Account Cards (Grid)
        const grid = document.getElementById('warmer-account-grid');
        if (grid) {
            const cardsHTML = accounts.map(acc => this._renderAccountCard(acc)).join('');
            if (grid.innerHTML !== cardsHTML) grid.innerHTML = cardsHTML;
        }

        // 4. Update Feed (Append Only)
        if (recentActivity && recentActivity.length > 0) {
            this._updateFeed(recentActivity);
        }
    },

    _renderAccountCard: function (acc) {
        const statusClass = acc.status === 'active' ? 'badge-active' : '';
        const statusLabel = acc.status === 'active' ? 'WARMING' : 'IDLE';
        const percent = acc.target ? Math.min(100, Math.round((acc.progress / acc.target) * 100)) : 0;

        const lastEvent = acc.lastEvent || 'Waiting for cycle...';

        return `
        <div class="account-card">
            <div class="account-avatar" style="background:${acc.status === 'active' ? '#dcfce7' : '#f1f5f9'}; color:${acc.status === 'active' ? '#166534' : '#64748b'};">
                ${acc.number.slice(-2)}
            </div>
            <div class="account-info">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <div class="account-number">${acc.number}</div>
                        <div class="account-badges">
                            <span class="mini-badge ${statusClass}">${statusLabel}</span>
                            <span class="mini-badge">Target: ${acc.progress}/${acc.target}</span>
                        </div>
                    </div>
                    <div class="trust-bar-container">
                        <div class="trust-score-val">${Math.round(acc.trustScore)}</div>
                        <span class="trust-label">HEALTH</span>
                    </div>
                </div>
                
                <div style="margin-top:12px;">
                    <div style="display:flex; justify-content:space-between; font-size:10px; color:#94a3b8; margin-bottom:4px;">
                        <span>Daily Progress</span>
                        <span>${percent}%</span>
                    </div>
                    <div style="width:100%; height:4px; background:#f1f5f9; border-radius:2px; overflow:hidden;">
                        <div style="width:${percent}%; height:100%; background:${percent >= 100 ? '#10b981' : '#3b82f6'}; border-radius:2px;"></div>
                    </div>
                </div>

                <div style="margin-top:12px; font-size:11px; color:#64748b; display:flex; gap:6px; align-items:center;">
                    <span style="width:4px; height:4px; background:#cbd5e1; border-radius:50%;"></span>
                    ${lastEvent}
                </div>
            </div>
        </div>
        `;
    },

    _updateFeed: function (activities) {
        const feed = document.getElementById('warmer-activity-feed');
        if (!feed) return;

        const html = activities.map(act => {
            let icon = 'ℹ️';
            let bgClass = 'icon-info';
            if (act.type === 'action') { icon = '⚡'; bgClass = 'icon-action'; }
            if (act.type === 'error') { icon = '⚠️'; bgClass = 'icon-error'; }
            if (act.type === 'success') { icon = '✅'; bgClass = 'icon-success'; }

            return `
            <div class="feed-item">
                <div class="feed-time">${act.timestamp}</div>
                <div class="feed-icon ${bgClass}">${icon}</div>
                <div class="feed-msg">${act.message}</div>
            </div>
            `;
        }).join('');

        if (feed.innerHTML !== html) {
            feed.innerHTML = html;
        }
    },

    _setText: function (id, val) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    }
};
