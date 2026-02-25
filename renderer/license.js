
// renderer/license.js - Titan License Validation UI (Production v1.0)
document.addEventListener('DOMContentLoaded', async () => {

    // ─────────────── BUILD OVERLAY ───────────────
    const overlay = document.createElement('div');
    overlay.id = 'license-overlay';
    overlay.className = 'hidden';
    overlay.innerHTML = `
        <div class="license-card">
            <div class="license-logo">T</div>
            <h2>Activate Titan 3.0</h2>
            <p id="license-subtitle">Enter your license key to authorize this hardware and unlock all features.</p>

            <div class="license-input-group">
                <label>License Key</label>
                <input type="text" id="license-input" class="license-input" placeholder="XXXX-XXXX-XXXX-XXXX" spellcheck="false" autocomplete="off">
            </div>

            <button id="license-btn" class="license-btn-primary">Authorize Hardware</button>
            <div id="license-error"></div>

            <div class="license-divider"><span>or</span></div>

            <button id="trial-btn" class="license-btn-secondary">Start a 7-day Free Trial</button>

        </div>
    `;
    document.body.appendChild(overlay);

    // ─────────────── ELEMENT REFS ───────────────
    const input = document.getElementById('license-input');
    const btn = document.getElementById('license-btn');
    const trialBtn = document.getElementById('trial-btn');
    const error = document.getElementById('license-error');
    const subtitle = document.getElementById('license-subtitle');

    // ─────────────── HELPERS ───────────────
    function showOverlay(reason) {
        if (reason) subtitle.innerText = reason;
        overlay.classList.remove('hidden');
    }

    function hideOverlay() {
        overlay.classList.add('hidden');
        error.innerText = '';
    }

    function setLoading(btnEl, loading, label) {
        if (!btnEl) return;
        btnEl.disabled = loading;
        btnEl.innerText = loading ? 'Please wait...' : label;
    }

    function applyLicense(limits, key) {
        window.TITAN_LICENSE = {
            valid: true,
            daily_send_limit: limits?.daily_send_limit || 0,
            daily_extract_limit: limits?.daily_extract_limit || 0,
            valid_until: limits?.valid_until || null,
            plan_type: limits?.plan_type || 'TRIAL',
            key: key || ''
        };
    }

    // ─────────────── INITIAL STATUS CHECK ───────────────
    try {
        const status = await window.api.getLicenseStatus();

        // Pre-fill key if cached
        if (status.key && status.key !== 'DEV-BYPASS-KEY') {
            input.value = status.key;
        }

        if (!status.isValid) {
            showOverlay(status.reason && status.reason !== '' ? `⚠️ ${status.reason}` : 'Please enter your license key to authorize this hardware.');
        } else {
            // Valid license — check expiry to show warning or expired notice
            try {
                const expiry = await window.api.getLicenseExpiry();
                if (expiry.hasExpiry) {
                    if (expiry.expired) {
                        // Show overlay with exact expiry timestamp
                        subtitle.innerHTML = `
                            <span style="color:#dc2626;font-weight:800;">LICENSE EXPIRED</span><br>
                            <span style="font-size:12px;color:#6b7280;">Expired on: <strong>${expiry.expiredAt}</strong></span><br>
                            <a href="#" onclick="window.open('https://titantools.io/renew','_blank');return false;"
                               style="color:#7c3aed;font-weight:900;font-size:13px;text-decoration:underline;">
                               Renew License →
                            </a>`;
                        overlay.classList.remove('hidden');
                    } else if (expiry.daysLeft <= 7) {
                        // Non-blocking warning shown as a banner
                        window.showTitanBanner && window.showTitanBanner(
                            `License expires in ${expiry.daysLeft} day${expiry.daysLeft !== 1 ? 's' : ''} (${expiry.expiryFormatted}). Renew soon.`,
                            'warning'
                        );
                    }
                }
            } catch (expiryErr) { /* non-fatal */ }
        }
    } catch (err) {
        console.error('[LICENSE-UI] Failed to get status:', err);
        showOverlay('Could not contact license server. Check your connection.');
    }


    // ─────────────── AUTHORIZE BUTTON ───────────────
    btn.onclick = async () => {
        const key = input.value.trim();
        if (!key) { error.innerText = 'Please enter a license key.'; return; }

        setLoading(btn, true, 'Authorize Hardware');
        error.innerText = '';

        try {
            const result = await window.api.validateLicense(key);
            if (result.success) {
                applyLicense(result.limits, key);
                hideOverlay();
                window.showTitanBanner('✅ License Activated. Welcome, Operator.', 'success');
                // Start held accounts now that license is confirmed
                window.api.reconnectAccounts?.();
                if (typeof render === 'function') render();
            } else {
                error.innerText = result.reason || 'Validation failed. Check your key and try again.';
            }
        } catch (err) {
            error.innerText = 'System error: ' + err.message;
        } finally {
            setLoading(btn, false, 'Authorize Hardware');
        }
    };

    // Allow Enter key to submit
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') btn.click(); });

    // ─────────────── FREE TRIAL BUTTON ───────────────
    trialBtn.onclick = async () => {
        if (!window.api.startFreeTrial) {
            error.innerText = 'Trial feature not available. Please update the app.';
            return;
        }

        setLoading(trialBtn, true, 'Start a 7-day Free Trial');
        error.innerText = '';

        try {
            const result = await window.api.startFreeTrial();
            if (result.success) {
                applyLicense(result.limits, result.key);
                input.value = result.key || '';
                hideOverlay();
                window.showTitanBanner(`Free Trial Activated! Plan: ${result.limits?.plan_type || 'TRIAL'}`, 'success');
                // Start held accounts now that trial is confirmed
                window.api.reconnectAccounts?.();
                if (typeof render === 'function') render();
            } else {
                error.innerText = result.reason || 'Trial not available. You may have already used your trial.';
            }
        } catch (err) {
            error.innerText = 'Could not start trial: ' + err.message;
        } finally {
            setLoading(trialBtn, false, 'Start a 7-day Free Trial');
        }
    };



    // ─────────────── LICENSE LOCK LISTENER (Server-Side Revocation) ───────────────
    // Triggered by heartbeat if the license is revoked remotely
    if (window.api.onLicenseLock) {
        window.api.onLicenseLock(({ reason }) => {
            console.warn('[LICENSE-UI] 🔒 Remote lock received:', reason);
            window.TITAN_LICENSE = { valid: false, daily_send_limit: 0, daily_extract_limit: 0, valid_until: null, plan_type: 'TRIAL', key: '' };
            showOverlay(`🔒 License Locked: ${reason}`);
            if (typeof render === 'function') render();
        });
    }
});
