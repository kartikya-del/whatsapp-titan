console.log('[APP] ===== TITAN ENGINE V2.1 ACTIVE =====')
console.log('[APP] Dashboard Initialized.')
// ================= STATE & CONFIG =================
let accounts = new Map()
let activeTab = 'dashboard'
let activeExtractAccount = null
let extractContainerCache = null

const STATES = {
    LOGGING_IN: 'logging_in',
    LOGGED_IN: 'logged_in',
    GETTING_GROUPS: 'getting_groups',
    GROUPS_READY: 'groups_ready',
    EXTRACTING: 'extracting',
    EXTRACTION_DONE: 'extraction_done',
    EXPORTED: 'exported',
    ERROR: 'error',
    DISCONNECTED: 'disconnected'
}

let _stagedLeads = []
let _messageVariants = ["Hello {name}, hope you are doing well!"]
let _innerSendTab = 'leads' // 'leads', 'messages', 'config', 'launch'
let _autoReplyRules = []
let _autoReplyEnabled = false
let _manualLeadState = { name: '', phone: '', bulk: '', showBulk: false }
let _geminiApiKey = ''
let _aiSystemPrompt = ''
let _isGeneratingAI = false
let _campaignStats = {
    totalSent: 0,
    totalFailed: 0,
    totalReceived: 0,
    activeCampaigns: 0
}
let _sidebarVisible = true
let _attachedMedia = null
let _attachedMediaName = ''
let _mediaSendMode = 'text_only' // 'combined', 'media_first', 'text_only'
let _recentMessages = [] // { from, body, timestamp, triggered }
let _botActivity = [] // Auto-reply activity log
let _activeCampaigns = new Map() // RUNNING campaigns (Engine)
let _campaignProjects = [] // SAVED projects (Drafts + History)
let _currentCampaignId = null // UI Workspace ID
let _workerConfig = {} // { 'number': { autoReply: boolean } }
let _campaignHistory = [] // Archive of completed campaigns
let _analyticsDate = new Date().toISOString().split('T')[0] // Default to today
let _viewingCampaignId = null
let _userDelayMin = 60
let _userDelayMax = 120
let _userBatchSize = 50
let _userSleepThreshold = 25 // messages before sleep
let _userSleepDuration = 10  // sleep duration in minutes
let _selectedAccounts = [] // Account IDs selected for campaign
let _isEngineRunning = false
window._titanStopping = false // KILL SWITCH FLAG
let _campaignWaitState = { active: false, seconds: 0 }
let _bannerUserForceHidden = true // TITAN: Default hide for "roaming" fix
let _survivabilityStats = { overview: {}, accounts: [] }
window.TITAN_LICENSE = { valid: false, daily_send_limit: 0, daily_extract_limit: 0, valid_until: null, plan_type: 'TRIAL' }

// ================= UTILITIES: NON-BLOCKING MODALS =================
window.titanConfirm = (title, message) => {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal')
        const titleEl = document.getElementById('confirm-title')
        const messageEl = document.getElementById('confirm-message')
        const yesBtn = document.getElementById('confirm-yes')
        const noBtn = document.getElementById('confirm-no')
        if (!modal) return resolve(confirm(message))

        titleEl.innerText = title
        messageEl.innerText = message
        yesBtn.innerText = 'Yes, Proceed'
        noBtn.style.display = 'block'
        modal.classList.remove('phone-modal-hidden')

        const handleYes = () => { cleanup(); resolve(true) }
        const handleNo = () => { cleanup(); resolve(false) }
        const cleanup = () => {
            modal.classList.add('phone-modal-hidden')
            yesBtn.removeEventListener('click', handleYes)
            noBtn.removeEventListener('click', handleNo)
        }
        yesBtn.addEventListener('click', handleYes)
        noBtn.addEventListener('click', handleNo)
    })
}

window.titanAlert = (title, message) => {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal')
        const titleEl = document.getElementById('confirm-title')
        const messageEl = document.getElementById('confirm-message')
        const yesBtn = document.getElementById('confirm-yes')
        const noBtn = document.getElementById('confirm-no')
        if (!modal) return resolve(alert(message))

        titleEl.innerText = title
        messageEl.innerText = message
        noBtn.style.display = 'none'
        yesBtn.innerText = 'OK'
        yesBtn.style.background = 'var(--primary)'
        modal.classList.remove('phone-modal-hidden')

        const handleOk = (e) => {
            modal.classList.add('phone-modal-hidden')
            noBtn.style.display = 'block'
            yesBtn.innerText = 'Yes, Proceed'
            yesBtn.style.background = 'var(--status-error)'
            yesBtn.removeEventListener('click', handleOk)
            // Restore hidden mid button if needed for next time
            const midBtn = document.getElementById('confirm-mid')
            if (midBtn) midBtn.style.display = 'none'
            resolve(e.target.dataset.action || 'yes')
        }
        yesBtn.addEventListener('click', handleOk)

        // TITAN Triple-Choice Hack
        const midBtn = document.getElementById('confirm-mid')
        if (midBtn) {
            midBtn.addEventListener('click', handleOk, { once: true })
        }
    })
}

window.titanChoice = (title, message, options = { yes: 'Add', mid: 'Clear', no: 'Cancel' }) => {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal')
        const titleEl = document.getElementById('confirm-title')
        const messageEl = document.getElementById('confirm-message')
        const yesBtn = document.getElementById('confirm-yes')
        const noBtn = document.getElementById('confirm-no')

        // Ensure mid button exists
        let midBtn = document.getElementById('confirm-mid')
        if (!midBtn) {
            midBtn = document.createElement('button')
            midBtn.id = 'confirm-mid'
            midBtn.className = 'btn-primary'
            midBtn.style.cssText = 'background:#64748b; margin-right:8px;'
            yesBtn.parentNode.insertBefore(midBtn, yesBtn)
        }

        titleEl.innerText = title
        messageEl.innerText = message

        yesBtn.innerText = options.yes
        yesBtn.dataset.action = 'add'
        yesBtn.style.background = 'var(--primary)'

        midBtn.innerText = options.mid
        midBtn.dataset.action = 'clear'
        midBtn.style.display = 'block'
        midBtn.style.background = '#64748b'

        noBtn.innerText = options.no
        noBtn.style.display = 'block'

        modal.classList.remove('phone-modal-hidden')

        const handleChoice = (e) => {
            const action = e.target.dataset.action || 'cancel'
            cleanup()
            resolve(action)
        }
        const handleCancel = () => { cleanup(); resolve('cancel') }

        const cleanup = () => {
            modal.classList.add('phone-modal-hidden')
            yesBtn.removeEventListener('click', handleChoice)
            midBtn.removeEventListener('click', handleChoice)
            noBtn.removeEventListener('click', handleCancel)
            midBtn.style.display = 'none'
        }

        yesBtn.addEventListener('click', handleChoice)
        midBtn.addEventListener('click', handleChoice)
        noBtn.addEventListener('click', handleCancel)
    })
}

window.showTitanBanner = (message, type = 'info') => {
    let banner = document.getElementById('titan-global-banner')
    if (!banner) {
        banner = document.createElement('div')
        banner.id = 'titan-global-banner'
        banner.style.cssText = `
            position: fixed; top: -100px; left: 50%; transform: translateX(-50%);
            z-index: 10000; padding: 14px 28px; border-radius: 12px;
            font-size: 14px; font-weight: 700; color: #fff;
            display: flex; align-items: center; gap: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        `
        document.body.appendChild(banner)
    }

    const icons = {
        info: 'ℹ️',
        success: '✅',
        error: '❌',
        warning: '⚠️'
    }
    const backgrounds = {
        info: '#3b82f6',
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b'
    }

    banner.innerHTML = `<span>${icons[type] || '🔔'}</span> <span>${message}</span>`
    banner.style.background = backgrounds[type] || backgrounds.info
    banner.style.top = '24px'

    setTimeout(() => {
        banner.style.top = '-100px'
    }, 4000)
}

// ─────────────── TRIAL LIMIT UTILITIES ───────────────
// Enforced in the MAIN PROCESS — not localStorage (which DevTools can clear).
const TRIAL_EXPORT_LIMIT = 100
const TRIAL_SEND_LIMIT = 25

// Returns { allowed, remaining } from main process
async function titanTrialLimitCheck(type) {
    try {
        return await window.api.checkTrialLimit(type)
    } catch (e) {
        return { allowed: true, remaining: Infinity } // fail open
    }
}

// Consumes 'amount' of the given type limit in main process
async function titanTrialConsume(type, amount) {
    try { await window.api.consumeTrialLimit(type, amount) } catch (e) { }
}

// Shows a styled "Upgrade" banner for limit hits.
function showUpgradeBanner(type) {
    const limit = type === 'export' ? TRIAL_EXPORT_LIMIT : TRIAL_SEND_LIMIT
    const unit = type === 'export' ? 'exports' : 'messages'
    const banner = document.getElementById('titan-global-banner')
    if (banner) {
        banner.innerHTML = `
            <span>🔒</span>
            <span>Free Trial limit reached — <strong>${limit} ${unit}/day</strong>.</span>
            <a href="#" onclick="window.open('https://titantools.io/upgrade','_blank');return false;"
               style="color:#fff;font-weight:900;text-decoration:underline;margin-left:8px;">
                Upgrade for Unlimited →
            </a>`
        banner.style.background = '#7c3aed'
        banner.style.top = '24px'
        setTimeout(() => { banner.style.top = '-100px' }, 7000)
    }
}
// ──────────────────────────────────────────────────────

// --- TITAN UTILITIES ---
const parseMatrix = (val, max) => {
    if (!val || typeof val !== 'string') return null
    const indices = new Set()
    const segments = val.split(',').map(s => s.trim()).filter(s => s)
    for (const seg of segments) {
        if (seg.includes('-')) {
            const parts = seg.split('-').map(n => parseInt(n.trim()))
            if (parts.length !== 2) return null
            const [start, end] = parts
            if (isNaN(start) || isNaN(end) || start < 1 || end < start || end > max) return null
            for (let i = start; i <= end; i++) indices.add(i - 1)
        } else {
            const num = parseInt(seg)
            if (isNaN(num) || num < 1 || num > max) return null
            indices.add(num - 1)
        }
    }
    const result = Array.from(indices).sort((a, b) => a - b)
    return result.length > 0 ? result : null
}

window.handleCampaignWizardNext = async (btn) => {
    window._titanStopping = false;
    localStorage.setItem('titan_kill', 'false');

    const totalLeads = _stagedLeads.length
    if (totalLeads === 0) {
        await titanAlert("Staging Empty", "No leads to process. Please add numbers to staging first.");
        return;
    }

    const mapping = []
    Array.from(accounts.values()).forEach(acc => {
        if (acc.range) {
            const indices = parseMatrix(acc.range, totalLeads)
            if (indices) mapping.push({ number: acc.number, indices, variantIndex: acc.assignedVariant || '0' })
        }
    })

    if (_innerSendTab === 'leads') {
        // TITAN STRICT: Enforce Allocation before proceeding
        if (mapping.length === 0) {
            await titanAlert("ENTER RANGE TO START", "Please use the sidebar to assign leads.")
            return;
        }

        // TITAN: Filter Queue - Only include assigned leads
        const assignedIndices = new Set()
        mapping.forEach(m => m.indices.forEach(i => assignedIndices.add(i)))

        const filteredQueue = _stagedLeads.filter((l, idx) => assignedIndices.has(idx))

        window._activeCampaignQueue = filteredQueue // Snapshot only assigned leads

        console.log(`[WIZARD] Locked ${filteredQueue.length} leads (dropped ${_stagedLeads.length - filteredQueue.length} unassigned)`)

        // Confirm Lock removed by user request. Auto-proceed.
        _innerSendTab = 'messages';
        render();
        return;
    }

    if (_innerSendTab === 'messages') { _innerSendTab = 'config'; render(); return; }
    if (_innerSendTab === 'config') {
        if (mapping.length === 0) { await titanAlert("Allocation Error", "No accounts assigned. Check the Distribution Matrix."); return; }

        if (await titanConfirm('Launch Campaign', `Are you sure you want to launch to ${window._activeCampaignQueue.length} targets?`)) {

            // ── TRIAL SEND LIMIT ENFORCEMENT ──
            const sendCheck = await titanTrialLimitCheck('send')
            if (!sendCheck.allowed) { showUpgradeBanner('send'); return; }
            if (sendCheck.remaining !== Infinity && window._activeCampaignQueue.length > sendCheck.remaining) {
                window.showTitanBanner(`Trial: Campaign capped at ${sendCheck.remaining} messages (daily limit: ${TRIAL_SEND_LIMIT}). Upgrade for unlimited.`, 'warning')
                window._activeCampaignQueue = window._activeCampaignQueue.slice(0, sendCheck.remaining)
                // Rebuild mapping indices to match trimmed queue
                mapping.forEach(m => { m.indices = m.indices.filter(i => i < sendCheck.remaining) })
            }
            await titanTrialConsume('send', window._activeCampaignQueue.length)
            // ─────────────────────────────────


            if (btn) { btn.disabled = true; btn.innerText = "DEPLOYING..."; }
            _archiveActiveCampaigns(); _activeCampaigns.clear();
            try {
                const campaignId = await window.api.campaignCreate({ leads: _stagedLeads, mapping, variants: _messageVariants })

                // Link project and set status to RUNNING
                const proj = _campaignProjects.find(p => p.id === _currentCampaignId)
                if (proj) {
                    proj.status = 'RUNNING'
                    proj.engineId = campaignId
                    saveCurrentProject()
                }

                window.api.campaignStart({ campaignId, mapping, options: { 
                    delayMin: _userDelayMin, 
                    delayMax: _userDelayMax, 
                    variants: _messageVariants, 
                    attachedMedia: _attachedMedia, 
                    mediaSendMode: _mediaSendMode,
                    sleepThreshold: _userSleepThreshold,
                    sleepDuration: _userSleepDuration
                } })
                _activeCampaigns.set(campaignId, { 
                    id: campaignId, 
                    leads: JSON.parse(JSON.stringify(window._activeCampaignQueue)), 
                    mapping, 
                    variants: [..._messageVariants], 
                    variantStats: _messageVariants.map(v => ({ text: v, sent: 0, replied: 0 })), 
                    startTime: Date.now(), 
                    status: 'RUNNING',
                    sleepThreshold: _userSleepThreshold,
                    sleepDuration: _userSleepDuration
                })
                _innerSendTab = 'launch'
                _viewingCampaignId = campaignId; render();
            } catch (e) {
                console.error(e);
                titanAlert("Launch Failed", e.message);
                if (btn) { btn.disabled = false; btn.innerText = "🚀 Launch Campaign"; }
            }
        }
    }
}


// ================= RENDER ENGINE (MUST BE BEFORE EVENT LISTENERS) =================

const _containers = {}

// ================= TITAN PULSE: FOCUS ENGINE =================
let _lastFocusedId = null
let _lastFocusedSelection = { start: 0, end: 0 }

function titanPulse() {
    const active = document.activeElement
    if (!active || active === document.body) {
        if (_lastFocusedId) {
            const target = document.getElementById(_lastFocusedId)
            if (target) {
                target.focus()
                if (target.setSelectionRange && _lastFocusedSelection) {
                    target.setSelectionRange(_lastFocusedSelection.start, _lastFocusedSelection.end)
                }
            }
        }
    }
    // Wake up Electron hit-test mapping
    window.dispatchEvent(new Event('focus'))
}

// ================= TITAN RENDER SCHEDULER (TOKEN-BASED) =================
let _renderToken = 0
let _renderScheduled = false

function render() {
    if (_renderScheduled) return
    _renderScheduled = true

    // INCREMENT TOKEN: Invalidate all previous incomplete renders
    _renderToken++
    const myToken = _renderToken

    requestAnimationFrame(() => {
        // SAFETY CHECK: If another render was requested while we waited for the frame,
        // _renderToken would have incremented again. If so, abort this stale frame.
        if (myToken !== _renderToken) {
            _renderScheduled = false
            return
        }

        _baseRender(myToken)
        _renderScheduled = false
    })
}

function _baseRender(token) {
    // DOUBLE CHECK: Token validation inside the execution block
    if (token !== _renderToken) return
    if (_activeCampaigns.size === 0 && _statusTimer) { clearInterval(_statusTimer); _statusTimer = null; }

    // TITAN: Scope Banner Visibility
    // TITAN: Scope Banner Visibility
    const banner = document.getElementById('campaign-status-banner')
    if (banner) {
        if (activeTab === 'campaigns' && _activeCampaigns.size > 0) {
            banner.classList.remove('hidden')
        } else {
            banner.classList.add('hidden')
        }
    }

    const main = document.getElementById('content-body')
    if (!main) return

    // 1. Capture Focus
    const active = document.activeElement
    if (active && active.id) {
        _lastFocusedId = active.id
        if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') {
            _lastFocusedSelection = { start: active.selectionStart, end: active.selectionEnd }
        }
    }

    // 2. Tab Container Management (Persistent)
    const tabs = ['dashboard', 'devices', 'campaigns', 'grabber', 'autoreply', 'warmer', 'reports']

    tabs.forEach(t => {
        if (!_containers[t]) {
            _containers[t] = document.createElement('div')
            _containers[t].className = 'tab-pane animate-in'
            _containers[t].id = `pane-${t}`
            _containers[t].style.display = 'none'
            main.appendChild(_containers[t])
        }
    })

    // 3. Render Active Tab
    const titleEl = document.getElementById('page-title')
    if (titleEl) titleEl.innerText = activeTab.charAt(0).toUpperCase() + activeTab.slice(1)

    tabs.forEach(t => {
        const pane = _containers[t]
        if (t === activeTab) {
            pane.style.display = 'block'

            // Map old renderers to new tabs
            if (t === 'dashboard') { if (titleEl) titleEl.innerText = 'Dashboard'; if (typeof renderDashboard === 'function') renderDashboard(pane) }
            if (t === 'devices') { if (titleEl) titleEl.innerText = 'Connected Devices'; renderAccounts(pane) }
            if (t === 'campaigns') { if (titleEl) titleEl.innerText = 'Campaign Center'; renderSendingCenter(pane) }
            if (t === 'grabber') { if (titleEl) titleEl.innerText = 'Group Extractor'; renderExtract(pane, token) }
            if (t === 'autoreply') {
                if (titleEl) titleEl.innerText = 'Auto-Reply Rules';
                const inner = renderAutoReply()
                if (pane.innerHTML !== inner) {
                    pane.innerHTML = inner
                    setupAutoReplyListeners(pane)
                }
            }
            if (t === 'warmer') {
                if (titleEl) titleEl.innerText = 'Number Warmer';
                renderWarmer(pane)
            }
            if (t === 'reports') { if (titleEl) titleEl.innerText = 'Performance Reports'; renderAnalytics(pane) }

        } else {
            pane.style.display = 'none'
        }
    })

    // Update Sidebar Active State
    document.querySelectorAll('.nav-item').forEach(el => {
        if (el.dataset.tab === activeTab) el.classList.add('active')
        else el.classList.remove('active')
    })

    titanPulse()
}


// --- HEAVY-DUTY FOCUS FIXES (TITAN SURGICAL) ---
window.showPhoneModal = () => {
    const modal = document.getElementById('phone-modal')
    const input = document.getElementById('phone-input')
    const error = document.getElementById('modal-error')

    if (!modal || !input) return console.error('[APP] Phone modal elements missing!')

    window.focus()
    input.value = ''
    if (error) error.innerText = ''
    modal.classList.remove('phone-modal-hidden')

    let attempts = 0
    const forceFocus = () => {
        input.focus()
        if (attempts++ < 10) setTimeout(forceFocus, 50)
    }
    forceFocus()
    titanPulse()
    document.addEventListener('focusin', guardFocus)
}

function guardFocus(e) {
    const modal = document.getElementById('phone-modal')
    const input = document.getElementById('phone-input')
    if (modal && !modal.classList.contains('phone-modal-hidden') && !modal.contains(e.target)) {
        input.focus()
    }
}

function hidePhoneModal() {
    const modal = document.getElementById('phone-modal')
    if (modal) modal.classList.add('phone-modal-hidden')
    document.removeEventListener('focusin', guardFocus)
    titanPulse()
}

// ================= DOM READY & BOOTSTRAP =================
document.addEventListener('DOMContentLoaded', () => {
    console.log('[APP] DOM Ready')

    // TITAN LICENSE CHECK: Sync local state with mainframe
    window.api.getLicenseStatus().then(async status => {
        // Build the license object
        const lic = {
            valid: status.isValid,
            daily_send_limit: status.limits?.daily_send_limit || 0,
            daily_extract_limit: status.limits?.daily_extract_limit || 0,
            valid_until: status.limits?.valid_until || null,
            plan_type: status.limits?.plan_type || 'TRIAL',
            key: status.key
        };

        // SECURITY: Freeze so renderer JS cannot mutate window.TITAN_LICENSE
        window.TITAN_LICENSE = Object.freeze(lic);

        if (window.TITAN_LICENSE.valid) {
            console.log('[APP] License verified. Plan:', window.TITAN_LICENSE.plan_type);
        }

        // ── LICENSE EXPIRY BADGE ──
        try {
            const expiry = await window.api.getLicenseExpiry();
            const badge = document.getElementById('license-expiry-badge');
            if (badge && expiry.hasExpiry) {
                if (expiry.expired) {
                    // License already expired — show exact moment + block notice
                    badge.style.display = 'block';
                    badge.style.background = '#fef2f2';
                    badge.style.color = '#dc2626';
                    badge.style.border = '1.5px solid #fee2e2';
                    badge.innerHTML = `
                        <div style="font-size:13px; margin-bottom:2px;">LICENSE EXPIRED</div>
                        <div style="font-weight:500; font-size:10px; color:#ef4444;">Expired: ${expiry.expiredAt}</div>
                        <a href="#" onclick="window.open('https://titantools.io/renew','_blank');return false;"
                           style="display:inline-block;margin-top:6px;color:#dc2626;font-size:10px;font-weight:900;text-decoration:underline;">
                           Renew License →
                        </a>`;
                } else if (expiry.daysLeft <= 7) {
                    // Expiring soon — show warning
                    badge.style.display = 'block';
                    badge.style.background = '#fffbeb';
                    badge.style.color = '#b45309';
                    badge.style.border = '1.5px solid #fde68a';
                    badge.innerHTML = `
                        <div style="font-size:10px;font-weight:500;">${lic.plan_type} Plan</div>
                        <div style="font-size:13px; margin:2px 0;">⚠ ${expiry.daysLeft} day${expiry.daysLeft !== 1 ? 's' : ''} left</div>
                        <div style="font-weight:500; font-size:10px; color:#92400e;">Expires: ${expiry.expiryFormatted}</div>`;
                } else {
                    // Healthy — show subtle green badge
                    badge.style.display = 'block';
                    badge.style.background = '#f0fdf4';
                    badge.style.color = '#15803d';
                    badge.style.border = '1.5px solid #bbf7d0';
                    badge.innerHTML = `
                        <div style="font-size:10px;font-weight:500;">${lic.plan_type} Plan</div>
                        <div style="font-size:11px; margin-top:2px;">${expiry.daysLeft} days remaining</div>`;
                }
            }
        } catch (e) { /* non-fatal */ }
        // ────────────────────────────────
    });


    // Load persisted campaign projects
    // Load persisted campaign projects & Recovery Session
    window.api.configGet().then(config => {
        // TITAN: Load Lifetime Stats & History
        if (config?.campaignHistory) {
            _campaignHistory = config.campaignHistory
            console.log(`[APP] Loaded ${_campaignHistory.length} history items`)
        }
        if (config?.campaignStats) {
            _campaignStats = config.campaignStats
        }

        // TITAN 3.0: Setup Survivability Monitoring
        setupSurvivabilityMonitoring()

        if (config?.campaignProjects) {
            _campaignProjects = config.campaignProjects
            console.log(`[APP] Loaded ${_campaignProjects.length} campaign project(s) from config`)
        }

        // TITAN: Restore Auto-Reply Rules & State on Startup
        if (config?.autoReplyRules && Array.isArray(config.autoReplyRules)) {
            _autoReplyRules = config.autoReplyRules
            console.log(`[APP] ✅ Loaded ${_autoReplyRules.length} auto-reply rule(s) from config`)
        }
        if (typeof config?.autoReplyEnabled === 'boolean') {
            _autoReplyEnabled = config.autoReplyEnabled
            console.log(`[APP] ✅ Auto-Reply Status: ${_autoReplyEnabled ? 'ACTIVE' : 'INACTIVE'}`)
        }
        if (config?.workerConfig) {
            _workerConfig = config.workerConfig
            console.log(`[APP] Loaded ${Object.keys(_workerConfig).length} worker config overrides`)
            // TITAN: Sync all active overrides to backend immediately
            Object.keys(_workerConfig).forEach(num => {
                if (window.api.updateWorkerConfig) {
                    window.api.updateWorkerConfig({ number: num, config: _workerConfig[num] })
                }
            })
        }

        // CRITICAL: Always push rules to backend (even if empty) to clear stale rules
        window.api.updateAutoReplySettings({ enabled: _autoReplyEnabled, rules: _autoReplyRules })
        console.log(`[APP] 🔄 Auto-Reply synced to backend (${_autoReplyRules.length} rules, ${_autoReplyEnabled ? 'ACTIVE' : 'INACTIVE'})`)

        // TITAN: Restore Gemini API Key & AI Prompt
        if (config?.geminiApiKey) _geminiApiKey = config.geminiApiKey
        if (config?.aiSystemPrompt) _aiSystemPrompt = config.aiSystemPrompt

        // TITAN RECOVERY: Restore crashed/interrupted session
        if (config?.activeCampaignsSession && config.activeCampaignsSession.length > 0) {
            console.log(`[APP] 🔄 RESTORING SESSION: Found ${config.activeCampaignsSession.length} active campaigns`)
            _activeCampaigns = new Map(config.activeCampaignsSession)

            // Auto-navigate to Send Tab to show the resumed state
            if (_activeCampaigns.size > 0) {
                activeTab = 'campaigns'
                _innerSendTab = 'launch'
                titanAlert('Session Restored', 'Your previous campaign session has been recovered. The dashboard has been updated.')
            }
            render()
        }
    }).catch(err => console.error('[APP] Config load failed:', err))

    const phoneModal = document.getElementById('phone-modal')
    const phoneInput = document.getElementById('phone-input')
    const modalError = document.getElementById('modal-error')
    const modalContent = document.querySelector('.modal-content')
    const modalConfirm = document.getElementById('modal-confirm')
    const modalCancel = document.getElementById('modal-cancel')

    // Force focus back if user clicks anywhere on the modal background
    phoneModal.addEventListener('mousedown', (e) => {
        if (e.target === phoneModal || e.target.classList.contains('modal-overlay')) {
            e.preventDefault()
            phoneInput.focus()
        }
    })

    modalConfirm.addEventListener('click', () => {
        let number = phoneInput.value.trim().replace(/\D/g, '')

        // --- TITAN SURGICAL: International Prefix Normalization ---
        // Handles: +91 (via \D strip), 91..., and 0091...
        if (number.length === 12 && number.startsWith('91')) {
            number = number.substring(2)
        } else if (number.length === 14 && number.startsWith('0091')) {
            number = number.substring(4)
        }

        modalError.innerText = ''

        if (!number || number.length !== 10) {
            modalError.innerText = 'Please enter exactly a 10-digit number.'
            phoneInput.focus()
            return;
        }

        if (accounts.has(number) && accounts.get(number).state !== STATES.ERROR) {
            modalError.innerText = 'This account is already active in your dashboard.'
            phoneInput.value = ''
            phoneInput.focus()
            return
        }

        hidePhoneModal()
        accounts.set(number, {
            number,
            state: STATES.LOGGING_IN,
            groups: [],
            contacts: [],
            progress: null,
            selectedGroupIds: new Set(),
            groupSearchQuery: '',
            searchQuery: ''
        })
        window.api.startAddAccount(number)
        render()
    })

    modalCancel.addEventListener('click', hidePhoneModal)

    // TITAN: Real-time 10-digit enforcement
    phoneInput.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '')
        if (val.length > 10) val = val.slice(-10)
        e.target.value = val
    })

    phoneInput.addEventListener('keypress', e => { if (e.key === 'Enter') modalConfirm.click() })

    // --- TITAN NAVIGATION ---
    setupNavigation()

    // --- LICENSE LOCK LISTENER ---
    // Triggered by background heartbeat if the server revokes the key mid-session
    if (window.api.onLicenseLock) {
        window.api.onLicenseLock(({ reason }) => {
            console.warn('[APP] 🔒 License lock received:', reason)
            // SECURITY: Freeze immediately — renderer cannot reassign after this
            window.TITAN_LICENSE = Object.freeze({ valid: false, daily_send_limit: 0, daily_extract_limit: 0, valid_until: null, plan_type: 'TRIAL', key: '' })
            render()
        })
    }

    // --- TITAN 5-LANE HIGHWAY SYSTEM ---

    // LANE 1: COMMAND (Priority UI State)
    window.api.onHighwayCommand(({ number, data }) => {
        const acc = accounts.get(number)
        if (!acc) return
        data.forEach(cmd => {
            if (cmd.type === 'STATE_SYNC') {
                acc.selectedGroupIds = new Set(cmd.selected);
            }
        })
        // TITAN SHIELD: Coalesced render for commands (sync/switch)
        const now = Date.now();
        if (activeTab === 'grabber' && activeExtractAccount === number) {
            if (!acc._lastCmdRender || (now - acc._lastCmdRender > 100)) {
                acc._lastCmdRender = now;
                render();
            }
        }
    })

    // LANE 2: TURBO (Massive Contact Stream)
    window.api.onHighwayTurbo(({ number, contacts }) => {
        const acc = accounts.get(number)
        if (!acc) return
        if (!acc.contacts) acc.contacts = []
        // TITAN SCALE: Use loop instead of spread to avoid stack overflow on 50k+ contacts
        for (let i = 0; i < contacts.length; i++) acc.contacts.push(contacts[i]);
        acc.contactCount = acc.contacts.length
        acc._lastUpdate = Date.now()

        // TITAN COALESCING: Limit re-renders to max 5 times/sec (200ms) to avoid CPU thrashing
        const now = Date.now();
        if (activeTab === 'grabber' && activeExtractAccount === number) {
            if (!acc._lastHighwayRender || (now - acc._lastHighwayRender > 200)) {
                acc._lastHighwayRender = now;
                render();
            }
        }
    })

    // LANE 3: DISCOVERY (Metadata/Groups)
    window.api.onHighwayDiscovery(({ number, updates }) => {
        const acc = accounts.get(number)
        if (!acc) return
        if (!acc.groups) acc.groups = []
        // TITAN SCALE: Use Map for O(1) lookups instead of O(n²) findIndex
        if (!acc._groupMap) {
            acc._groupMap = new Map();
            acc.groups.forEach(g => acc._groupMap.set(g.id, g));
        }
        updates.forEach(g => {
            if (acc._groupMap.has(g.id)) {
                Object.assign(acc._groupMap.get(g.id), g)
            } else {
                acc.groups.push(g)
                acc._groupMap.set(g.id, g)
            }
        })
        acc.discoveryStats = { done: acc.groups.length, loading: true }
        if (activeExtractAccount === number) render()
    })

    // LANE 4: PULSE (Telemetry)
    window.api.onHighwayPulse(({ number, stats }) => {
        const acc = accounts.get(number)
        if (!acc) return
        acc.progress = stats
        acc.state = STATES.EXTRACTING
        if (activeExtractAccount === number) render()
    })

    // LANE 5: SYSTEM (Lifecycle & Health)
    window.api.onHighwaySystem(({ number, events }) => {
        const acc = accounts.get(number)
        if (!acc) return
        events.forEach(ev => {
            if (ev.type === 'QR') { acc.state = STATES.LOGGING_IN; acc.qr = ev.qr; }
            if (ev.type === 'READY') { acc.state = STATES.LOGGED_IN; }
            if (ev.type === 'ERROR') { acc.state = STATES.ERROR; acc.error = ev.error; }
            if (ev.type === 'DISCONNECTED') { acc.state = STATES.DISCONNECTED; }
            if (ev.type === 'EXTRACTION_COMPLETE') {
                acc.state = STATES.EXTRACTION_DONE;
                acc.contacts = ev.contacts;
                acc.contactCount = ev.contacts.length;
            }
            if (ev.type === 'METADATA_COMPLETE' || ev.type === 'DISCOVERY_COMPLETE') {
                acc.state = STATES.GROUPS_READY;
                acc.discoveryStats = null;
            }
            if (ev.type === 'STATE_RESET') {
                acc.selectedGroupIds = new Set();
                acc.contacts = [];
                acc.contactCount = 0;
            }
            if (ev.type === 'MESSAGE_RECEIVED') {
                console.log('[APP] 📊 Highway: Message Received', ev)
                _recentMessages.unshift({
                    from: ev.from,
                    body: ev.body,
                    timestamp: new Date().toLocaleTimeString(),
                    number: ev.number
                })
                if (_recentMessages.length > 20) _recentMessages.pop()
                if (activeTab === 'reports' || activeTab === 'autoreply') render()
            }
            if (ev.type === 'BOT_ACTIVITY') {
                _botActivity.push(ev)
                if (_botActivity.length > 50) _botActivity.shift()

                const action = ev.action.toUpperCase();
                let color = '#3b82f6';
                let icon = '🤖';

                if (action === 'MATCHING' || action === 'MATCH') { color = '#3b82f6'; icon = '🎯'; }
                if (action === 'OPERATOR_STOP') { color = '#ef4444'; icon = '🛡️'; }
                if (action === 'OPERATOR_RESUME') { color = '#10b981'; icon = '♻️'; }
                if (action === 'SENT') { color = '#10b981'; icon = '✅'; }
                if (action === 'ERROR') { color = '#ef4444'; icon = '❌'; }
                if (action === 'BOT_SENT') { color = '#3b82f6'; icon = '🤖'; }

                if (action === 'CONVERSION') {
                    color = '#fbbf24'; icon = '🏆';
                    _campaignStats.totalReceived++
                    window.api.configSave({ campaignStats: _campaignStats })
                    if (activeTab === 'reports') render()
                }

                const feed = document.getElementById('guardian-log-container')
                if (feed) {
                    const item = document.createElement('div')
                    item.style.marginBottom = '12px'
                    item.style.display = 'flex'
                    item.style.gap = '16px'
                    item.style.borderBottom = '1px solid rgba(255,255,255,0.03)'
                    item.style.paddingBottom = '10px'
                    item.innerHTML = `
                        <span style="color:#475569; min-width:85px; font-size:10px;">[${ev.time}]</span>
                        <div style="flex:1;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                                <span style="font-size:12px;">${icon}</span>
                                <span style="font-weight:800; font-size:11px; color:${color}; text-transform:uppercase;">${action}</span>
                                <span style="color:#475569; margin:0 8px;">❯</span>
                                <span style="color:#fff; opacity:0.85; font-size:11px;">${ev.details}</span>
                            </div>
                        </div>`
                    feed.prepend(item)
                    if (feed.children.length > 50) feed.lastElementChild.remove()
                }
            }
        })
    // LANE 6: HEALTH (Account Safety suggestions)
    if (window.api.onHealthAlert) {
        window.api.onHealthAlert((alert) => {
            window.showHealthSuggestion(alert)
        })
    }

    render()
    })
})

window.showHealthSuggestion = (alert) => {
    // Remove if already exists for this number
    const existing = document.getElementById(`health-alert-${alert.number}`)
    if (existing) existing.remove()

    const banner = document.createElement('div')
    banner.id = `health-alert-${alert.number}`
    banner.className = `health-alert-banner ${alert.tier}`
    
    const icon = alert.tier === 'caution' ? '🟡' : (alert.tier === 'warning' ? '🟠' : '🔴')
    const title = alert.tier === 'caution' ? 'Account Fatigue' : (alert.tier === 'warning' ? 'Account Risk' : 'Critical Hazard')

    banner.innerHTML = `
        <div class="health-header">
            <span class="health-icon">${icon}</span>
            <span class="health-title">${title}</span>
        </div>
        <div class="health-body">
            Account <b>+${alert.number}</b> trust score dropped to <b>${alert.trustScore}%</b>. 
            We highly recommend increasing the delay to <b>${alert.suggestedDelay}s</b> to mimic human behavior.
        </div>
        <div class="health-actions">
            <button class="health-btn health-btn-apply" id="health-apply-${alert.number}">Apply Suggestion</button>
            <button class="health-btn health-btn-ignore" id="health-ignore-${alert.number}">Ignore Risk</button>
        </div>
    `

    document.body.appendChild(banner)

    // Handle Apply
    document.getElementById(`health-apply-${alert.number}`).onclick = () => {
        _userDelayMin = alert.suggestedDelay
        _userDelayMax = alert.suggestedDelay + 60
        window.showTitanBanner(`Protection Active: Delay increased to ${alert.suggestedDelay}s - ${alert.suggestedDelay + 60}s.`, 'success')
        banner.remove()
        render() // Update UI indicators
    }

    // Handle Ignore
    document.getElementById(`health-ignore-${alert.number}`).onclick = () => {
        banner.remove()
    }

    // Auto-remove after 30 seconds if not interacted with
    setTimeout(() => {
        if (banner.parentElement) banner.remove()
    }, 30000)
}


window.api.onAccountExported(({ number, path, count }) => {
    window.showTitanBanner(`Export Successful: ${count} contacts saved for +${number}`, 'success')
})

// --- LIVE CAMPAIGN BANNER LOGIC ---
let _campaignStartTime = 0;

// NOTE: The SINGLE onCampaignProgress listener is registered below in the
// "OUTREACH LISTENERS (ENHANCED)" section to avoid double-registration bugs.
// Do NOT register another one here.

// Global timer ref
let _statusTimer = null;

// DELETED REDUNDANT LISTENER (Consolidated below)

window.api.onExclusionDone(({ number, excludedArray }) => {
    const acc = accounts.get(number)
    if (acc) {
        // --- TITAN ULTRA-WIPE: Robust Exclusion Logic ---
        // We normalize numbers to their last 10 digits to handle country code variants
        const normalize = (num) => {
            const s = String(num || '').replace(/\D/g, '')
            return s.length >= 10 ? s.slice(-10) : s
        }

        const blockedSet = new Set(excludedArray.map(normalize))
        const oldLen = acc.contacts.length

        // Filter out ANY contact whose phone (normalized) matches ANY blocked number (normalized)
        acc.contacts = acc.contacts.filter(c => {
            const normPhone = normalize(c.phone)
            return !blockedSet.has(normPhone)
        })

        const purged = oldLen - acc.contacts.length
        console.log(`[APP] Exclusion Wipe Complete. Purged: ${purged}`)

        if (purged > 0) {
            window.titanAlert("Exclusion Success", `Wiped ${purged.toLocaleString()} entries from your list. All duplicates and matches have been removed.`)
        } else {
            window.showTitanBanner("No matching numbers were found in your current list.", "info")
        }

        if (activeTab === 'devices' || activeTab === 'grabber') render()
    }
})



window.api.onAccountError(({ number, error }) => {
    const acc = accounts.get(number)
    if (acc) {
        acc.state = STATES.ERROR
        acc.error = error
        if (activeTab === 'devices') render()
    }
})

window.api.onAccountRemoved(({ number }) => {
    console.log(`[APP] 🗑️ Account removed: ${number}`)
    if (accounts.has(number)) {
        accounts.delete(number)
        if (activeExtractAccount === number) activeExtractAccount = null
        render()
    }
})

// Load initial config
window.api.configGet().then(config => {
    if (config.geminiApiKey) _geminiApiKey = config.geminiApiKey
    if (config.aiSystemPrompt) _aiSystemPrompt = config.aiSystemPrompt
    if (config.variants) _messageVariants = config.variants
    if (config.autoReplyRules) _autoReplyRules = config.autoReplyRules
    if (config.autoReplyEnabled !== undefined) _autoReplyEnabled = config.autoReplyEnabled
    if (config.campaignStats) _campaignStats = config.campaignStats

    // --- CRITICAL SYNC: Always push current rules to backend (clears stale rules) ---
    window.api.updateAutoReplySettings({ enabled: _autoReplyEnabled, rules: _autoReplyRules })

    render()
})

render()

// ================= GLOBAL SYNC =================
async function syncAccountsWithBackend() {
    try {
        const backendAccounts = await window.api.getAccounts()
        const backendNumbers = new Set(backendAccounts.map(ba => ba.number))

        // TITAN: Purge local accounts that no longer exist in backend
        for (const num of accounts.keys()) {
            if (!backendNumbers.has(num)) {
                console.log(`[APP] 🧹 Purging stale local account: ${num}`)
                accounts.delete(num)
                if (activeExtractAccount === num) activeExtractAccount = null
            }
        }

        if (backendAccounts.length > 0) {
            console.log(`[APP] Sync: Received ${backendAccounts.length} accounts from backend`)
        }
        backendAccounts.forEach(ba => {
            let acc = accounts.get(ba.number)
            if (!acc) {
                acc = {
                    number: ba.number, state: STATES.LOGGED_IN, groups: [], contacts: ba.contacts || [],
                    error: null, selectedGroupIds: new Set(), groupSearchQuery: '', searchQuery: ''
                }
                accounts.set(ba.number, acc)
            }
            acc.todayCount = ba.todayCount || 0
            acc.lifetimeCount = ba.lifetimeCount || 0
            acc.groupCount = ba.groupCount || 0
            acc.contactCount = ba.contactCount || 0

            // TITAN MEMORY SYNC: No more disk-based restoration.
            // Full hydration now only happens via 'account:data' when actively viewed.
            const isSelfReady = acc.number === activeExtractAccount && activeTab === 'grabber'

            // TITAN MEMORY OPTIMIZATION: Disable automatic hydration on switch. User must click Sync.
            // if (isSelfReady && acc.groups.length === 0 && acc.groupCount > 0 && !acc._isHydrating) {
            //     hydrateAccountData(acc.number)
            // }

            if (ba.extracting && acc.state !== STATES.EXTRACTING) acc.state = STATES.EXTRACTING
            // TITAN: Sync the Auto-Reply status from backend overrides
            if (ba.autoReply !== undefined) acc.autoReply = ba.autoReply

            // --- TITAN SYNC: Live Connection State ---
            if (ba.liveState === 'disconnected') {
                acc.state = STATES.DISCONNECTED
            } else if (ba.liveState === 'ready' && (acc.state === STATES.DISCONNECTED || acc.state === STATES.ERROR)) {
                acc.state = STATES.LOGGED_IN
            }
        })

        // Selective re-render based on tab to save CPU
        if (activeTab === 'devices') {
            const list = document.getElementById('accounts-list-container')
            if (list) refreshAccountsList(list)
        } else if (activeTab === 'grabber' && !activeExtractAccount) {
            render()
        }
    } catch (err) {
        console.error('[APP] Sync failed:', err)
    }
}

async function hydrateAccountData(number) {
    const acc = accounts.get(number)
    if (!acc || acc._isHydrating) return

    acc._isHydrating = true
    console.log(`[APP] 🌊 Hydrating Data for +${number}...`)

    try {
        const data = await window.api.getAccountData(number)
        if (data) {
            acc.groups = data.groups || []
            acc.contacts = data.contacts || []
            acc.groupCount = acc.groups.length
            acc.contactCount = acc.contacts.length
            console.log(`[APP] ✅ Hydrated ${acc.contacts.length} contacts for +${number}`)
            render()
        }
    } catch (err) {
        console.error(`[APP] Hydration failed for +${number}:`, err)
    } finally {
        acc._isHydrating = false
    }
}

setInterval(syncAccountsWithBackend, 5000)

let _lastRenderTime = 0
let _renderTimeout = null


function renderTopBar() {
    const bar = document.getElementById('top-bar')
    if (!bar) return

    let actionsContainer = bar.querySelector('#top-bar-actions')
    if (!actionsContainer) {
        actionsContainer = document.createElement('div')
        actionsContainer.id = 'top-bar-actions'
        actionsContainer.style.cssText = 'display:flex; align-items:center; gap:10px;'
        bar.appendChild(actionsContainer)
    }

    actionsContainer.innerHTML = ''

    // Only show sidebar toggle when on old campaign workspace (not wizard builder)
    if (activeTab === 'campaigns' && _currentCampaignId && _campaignView !== 'builder') {
        const toggleBtn = document.createElement('button')
        toggleBtn.id = 'toggle-sidebar-btn'
        toggleBtn.className = 'btn-secondary'
        toggleBtn.style.cssText = 'padding:7px 14px; font-size:12px; font-weight:600; margin-right: 8px;'
        toggleBtn.textContent = _sidebarVisible ? 'Hide Panel' : 'Show Panel'
        toggleBtn.onclick = (e) => {
            e.stopPropagation();
            _sidebarVisible = !_sidebarVisible;
            render()
        }
        actionsContainer.appendChild(toggleBtn)
    }

    const emergencyBtn = document.createElement('button')
    emergencyBtn.id = 'titan-kill-switch'
    emergencyBtn.style.cssText = 'background:#ef4444; color:#fff; border:none; padding:7px 16px; border-radius:8px; font-weight:600; font-size:12px; cursor:pointer; transition:all 0.2s;'
    emergencyBtn.textContent = 'Emergency Stop'
    emergencyBtn.addEventListener('click', async () => {
        const confirmed = await window.titanConfirm(
            "Emergency Protocol",
            "This will immediately terminate all active WhatsApp campaigns and extraction pipelines across all accounts. Proceed?"
        )
        if (confirmed) {
            window._titanStopping = true; localStorage.setItem('titan_kill', 'true'); // ACTIVATE KILL SWITCH w/ PERSISTENCE
            window.api.emergencyStopAll()
            // FORCE UI CLEANUP
            _activeCampaigns.clear()
            const banner = document.getElementById('campaign-status-banner')
            if (banner) banner.classList.add('hidden')
            if (_statusTimer) { clearInterval(_statusTimer); _statusTimer = null; }
            _campaignWaitState.active = false
            render()
            // FORCE BUTTON RESET
            setTimeout(() => {
                const lb = document.getElementById('sidebar-launch-btn')
                if (lb) {
                    lb.innerHTML = 'Start Campaign'
                    lb.disabled = false
                    lb.style.background = ''
                    lb.style.color = ''
                    lb.style.cursor = 'pointer'
                }
            }, 50)
            window.showTitanBanner("All processes have been successfully terminated.", "success")
        }
    })
    actionsContainer.appendChild(emergencyBtn)
}

function updateSummary() {
    // No-op — summary bar has been removed
}

// ================= DEVICES TAB =================
function renderAccounts(container) {
    let layout = container.querySelector('.devices-layout')
    if (!layout) {
        container.innerHTML = `
          <div class="devices-layout">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:28px;">
              <div>
                <h2 style="margin:0 0 4px 0; font-size:22px; font-weight:800; color:var(--text-main); letter-spacing:-0.02em;">Connected Devices</h2>
                <p style="margin:0; color:var(--text-muted); font-size:13px;">Manage your linked WhatsApp sessions.</p>
              </div>
              <div style="display:flex; gap:10px;">
                <button id="refresh-accounts" class="btn-secondary" style="padding:9px 18px; font-size:13px;">↻ Refresh</button>
                <button id="add-account" class="btn-primary" style="padding:9px 18px; font-size:13px;">+ Add Device</button>
              </div>
            </div>
            <div id="accounts-list-container"></div>
          </div>
        `
        layout = container.querySelector('.devices-layout')

        layout.querySelector('#add-account').addEventListener('click', window.showPhoneModal)
        layout.querySelector('#refresh-accounts').addEventListener('click', () => syncAccountsWithBackend())

        // Event delegation for all card buttons
        layout.querySelector('#accounts-list-container').addEventListener('click', async (e) => {
            const btn = e.target.closest('button')
            if (!btn) return
            const num = btn.dataset.number

            if (btn.classList.contains('reconnect-btn')) {
                window.api.startAddAccount(num); render()
            }
            if (btn.classList.contains('fix-db-btn')) {
                if (await window.titanConfirm('Surgical Cache Wipe', `This will force close +${num} and purge its browser database to fix corruption. You will need to Reconnect after. Continue?`)) {
                    window.api.clearAccountCache(num)
                    window.showTitanBanner(`Cache purged for +${num}. Please click Reconnect.`, 'success')
                }
            }
            if (btn.classList.contains('logout-btn')) {
                if (await window.titanConfirm('Logout Device', `Are you sure you want to logout +${num}?`)) {
                    window.api.removeAccount(num)
                }
            }
        })
    }

    refreshAccountsList(layout.querySelector('#accounts-list-container'))
}

function refreshAccountsList(list) {
    if (!list) return
    list.innerHTML = ''

    if (accounts.size === 0) {
        list.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:100px 40px; background:linear-gradient(135deg, #f8fafc 0%, #ffffff 100%); border-radius:24px; border:2px dashed #e2e8f0; margin:20px;">
            <div style="width:80px; height:80px; background:#eff6ff; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-bottom:24px;">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
            </div>
            <h3 style="margin:0 0 8px 0; font-size:20px; font-weight:800; color:var(--text-main); letter-spacing:-0.02em;">No Devices Connected</h3>
            <p style="color:var(--text-muted); margin:0 0 32px 0; font-size:14px; text-align:center; max-width:400px; line-height:1.6;">Link your WhatsApp accounts to the system to begin automated extraction and outreach operations.</p>
            <button id="empty-state-btn" class="btn-primary" style="padding:14px 40px; border-radius:12px; font-weight:800; font-size:14px; box-shadow:0 10px 20px -10px var(--primary);">+ Add New Device</button>
        </div>`
        list.querySelector('#empty-state-btn')?.addEventListener('click', window.showPhoneModal)
        return
    }

    const grid = document.createElement('div')
    grid.style.cssText = 'display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:16px; padding:10px;'

    const accountArray = Array.from(accounts.values());
    accountArray.forEach((acc, idx) => {
        const tStats = _survivabilityStats.accounts.find(s => s.number === acc.number) || { healthScore: 100, status: 'READY', color: '#22c55e', remark: '' }

        const isOnline = acc.state !== STATES.ERROR && acc.state !== STATES.DISCONNECTED;
        const statusColor = isOnline ? tStats.color : '#ef4444';
        const usagePct = Math.min(100, ((acc.todayCount || 0) / 200) * 100);

        const card = document.createElement('div')
        card.className = 'titan-device-card'
        card.style.cssText = `
            background:#ffffff;
            border:1px solid #e2e8f0;
            border-radius:16px;
            padding:16px;
            display:flex;
            flex-direction:column;
            gap:14px;
            position:relative;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        `
        card.onmouseenter = () => {
            card.style.borderColor = statusColor + '40';
            card.style.boxShadow = `0 10px 15px -3px rgba(0, 0, 0, 0.05)`;
        }
        card.onmouseleave = () => {
            card.style.borderColor = '#e2e8f0';
            card.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
        }

        card.innerHTML = `
            <!-- HEADER -->
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; gap:12px; align-items:center;">
                    <div style="width:40px; height:40px; border-radius:10px; background:${statusColor}10; display:flex; align-items:center; justify-content:center; position:relative; border:1px solid ${statusColor}20;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${statusColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                    </div>
                    <div>
                        <div style="font-size:15px; font-weight:800; color:var(--text-main);">+${acc.number}</div>
                        <div style="display:flex; align-items:center; gap:5px; margin-top:2px;">
                            <span style="width:6px; height:6px; border-radius:50%; flex-shrink:0; background:${statusColor}; ${isOnline ? 'animation:pulse-dot 2s infinite;' : ''}"></span>
                            <span style="font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">${acc.state.replace('_', ' ')}</span>
                        </div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:18px; font-weight:900; color:${tStats.color};">${tStats.healthScore}%</div>
                    <div style="font-size:8px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Health</div>
                </div>
            </div>

            <!-- COMPACT STATS -->
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <div style="background:#f8fafc; border-radius:10px; padding:10px; text-align:center;">
                    <div style="font-size:9px; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:2px;">Today</div>
                    <div style="font-size:16px; font-weight:900; color:var(--text-main);">${(acc.todayCount || 0).toLocaleString()}</div>
                </div>
                <div style="background:#f8fafc; border-radius:10px; padding:10px; text-align:center;">
                    <div style="font-size:9px; font-weight:800; color:#94a3b8; text-transform:uppercase; margin-bottom:2px;">Total</div>
                    <div style="font-size:16px; font-weight:900; color:var(--text-main);">${(acc.lifetimeCount || 0).toLocaleString()}</div>
                </div>
            </div>

            <!-- USAGE PROGRESS -->
            <div style="height:4px; background:#f1f5f9; border-radius:10px; overflow:hidden;">
                <div style="height:100%; width:${usagePct}%; background:${statusColor}; border-radius:10px;"></div>
            </div>

            <!-- ACTIONS -->
            <div style="display:flex; gap:8px;">
                ${!isOnline
                ? `<button class="reconnect-btn btn-primary" data-number="${acc.number}" style="flex:2; padding:8px 12px; border-radius:8px; font-weight:800; font-size:11px; display:flex; align-items:center; justify-content:center; gap:6px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                        Reconnect
                     </button>`
                : `<button class="fix-db-btn btn-secondary" data-number="${acc.number}" style="flex:2; padding:8px 12px; border-radius:8px; font-weight:700; font-size:11px; background:#fff; border:1px solid #e2e8f0;">
                        Fix Cache
                     </button>`
            }
                <button class="logout-btn" data-number="${acc.number}" style="flex:1; padding:8px 12px; border:1px solid #fee2e2; background:#fff5f5; color:#ef4444; border-radius:8px; font-size:11px; font-weight:800; cursor:pointer;" onmouseenter="this.style.background='#fee2e2'" onmouseleave="this.style.background='#fff5f5'">
                    Logout
                </button>
            </div>
        `
        grid.appendChild(card)
    })

    list.appendChild(grid)
}



// ================= GROUP GRABBER TAB =================
function renderExtract(container, token) {
    if (token !== _renderToken) return

    const readyAccounts = Array.from(accounts.values())

    let layout = container.querySelector('.extract-container')
    if (!layout) {
        container.innerHTML = `
          <div class="extract-container" style="display:flex; flex-direction:column; height:calc(100vh - 80px); overflow:hidden; gap:16px;">
            <!-- Account selector row -->
            <div style="display:flex; justify-content:space-between; align-items:center;">
               <div id="mini-cards-row" style="display:flex; gap:8px; overflow-x:auto;"></div>
               <div style="display:flex; gap:10px;">
                   <button id="sync-active-btn" class="btn-secondary" style="white-space:nowrap; padding:12px 20px; font-size:13px; font-weight:700; border-radius:12px; border:1px solid var(--border-light); background:#fff;">↻ Sync Active</button>
                   <button id="load-all-groups" class="btn-secondary" style="white-space:nowrap; padding:12px 20px; font-size:13px; font-weight:700; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">↻ Sync All Groups</button>
               </div>
            </div>
            <!-- Main workspace -->
            <div id="extract-workspace" style="display:flex; gap:16px; flex:1; overflow:hidden;"></div>
          </div>
        `
        layout = container.querySelector('.extract-container')
    }

    const cardsRow = layout.querySelector('#mini-cards-row')
    const workspace = layout.querySelector('#extract-workspace')
    const loadAllBtn = layout.querySelector('#load-all-groups')
    const syncActiveBtn = layout.querySelector('#sync-active-btn')

    if (readyAccounts.length === 0) {
        cardsRow.innerHTML = ''
        workspace.innerHTML = `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fff; border-radius:16px; border:1px solid var(--border-light); padding:60px;">
                <div style="font-size:48px; margin-bottom:16px;">⚡</div>
                <h3 style="margin:0 0 8px 0; font-size:18px; font-weight:700;">No Devices Connected</h3>
                <p style="color:var(--text-muted); margin:0; font-size:14px;">Connect a WhatsApp account from the Devices tab first.</p>
            </div>`
        if (loadAllBtn) loadAllBtn.style.display = 'none'
        if (syncActiveBtn) syncActiveBtn.style.display = 'none'
        return
    }

    if (loadAllBtn) loadAllBtn.style.display = 'block'
    if (syncActiveBtn) {
        syncActiveBtn.style.display = 'block'
        // Remove old listeners to prevent stacking if render called multiple times? 
        // Better to use .onclick assignment for idempotency here (simple UI)
        syncActiveBtn.onclick = () => {
            if (activeExtractAccount) {
                window.showTitanBanner(`Syncing active worker (+${activeExtractAccount})...`, 'info')
                window.api.getGroups(activeExtractAccount)
            }
        }
    }
    if (!activeExtractAccount || !readyAccounts.find(a => a.number === activeExtractAccount)) {
        activeExtractAccount = readyAccounts.length > 0 ? readyAccounts[0].number : null
    }

    // Account pill tabs
    const cardsHtml = readyAccounts.map(acc => {
        const isActive = acc.number === activeExtractAccount
        const isExtracting = acc.state === STATES.EXTRACTING
        const isErr = acc.state === STATES.ERROR || acc.state === STATES.DISCONNECTED
        const dotColor = isExtracting ? '#8b5cf6' : acc.state === STATES.LOGGED_IN ? 'var(--primary)' : isErr ? '#ef4444' : '#94a3b8'

        return `
          <div class="acc-mini-card" data-number="${acc.number}"
               style="display:flex; align-items:center; gap:10px; padding:12px 20px; border-radius:12px; cursor:pointer; border:2px solid ${isActive ? (isErr ? '#ef4444' : 'var(--primary)') : 'var(--border-light)'}; background:${isActive ? (isErr ? '#fff5f5' : '#eff6ff') : '#fff'}; transition:all 0.2s; white-space:nowrap; box-shadow:${isActive ? '0 0 0 3px rgba(59,130,246,0.1)' : '0 1px 3px rgba(0,0,0,0.05)'};">
            <div style="width:10px; height:10px; border-radius:50%; flex-shrink:0; background:${dotColor}; ${isActive && !isErr && !isExtracting ? 'animation:pulse-dot 2s infinite;' : ''}"></div>
            <div style="display:flex; flex-direction:column; gap:1px;">
              <span style="font-size:15px; font-weight:800; color:${isActive ? (isErr ? '#ef4444' : 'var(--primary)') : 'var(--text-main)'}; letter-spacing:-0.02em;">+${acc.number}</span>
              <span style="font-size:11px; color:var(--text-muted); font-weight:600; letter-spacing:0.02em;">
                ${acc.state.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          </div>
        `
    }).join('')

    if (cardsRow.innerHTML !== cardsHtml) {
        cardsRow.innerHTML = cardsHtml
        setupExtractListeners(container)
    }

    const currentAcc = accounts.get(activeExtractAccount)
    if (currentAcc) renderWorkspace(workspace, currentAcc, token)
}

function setupExtractListeners(container) {
    const readyAccounts = Array.from(accounts.values()).filter(a => a.state !== STATES.LOGGING_IN && a.state !== STATES.ERROR)
    const loadAllBtn = container.querySelector('#load-all-groups')
    const syncActiveBtn = container.querySelector('#sync-active-btn')

    if (loadAllBtn) {
        loadAllBtn.onclick = () => readyAccounts.forEach(acc => {
            acc.state = STATES.GETTING_GROUPS;
            acc.discoveryStats = { loading: true, count: acc.groups?.length || 0 };
            render();
            window.api.getGroups(acc.number);
        })
    }

    if (syncActiveBtn) {
        syncActiveBtn.onclick = () => {
            const acc = accounts.get(activeExtractAccount)
            if (acc) {
                acc.state = STATES.GETTING_GROUPS;
                acc.discoveryStats = { loading: true, count: acc.groups?.length || 0 };

                // TITAN: On sync, force the 'Select All' box to uncheck if it was stuck
                const box = container.querySelector('#select-all-groups');
                if (box) box.checked = false;
                if (acc.selectedGroupIds) acc.selectedGroupIds.clear();

                render();
                window.api.getGroups(acc.number);
            }
        }
    }

    container.querySelectorAll('.acc-mini-card').forEach(card => {
        card.addEventListener('click', () => {
            const number = card.dataset.number
            if (activeExtractAccount === number) return

            // TITAN CLEAN SLATE: Wipe previous account's UI memory to prevent RAM bloat/freezes
            if (activeExtractAccount && accounts.has(activeExtractAccount)) {
                const prev = accounts.get(activeExtractAccount);
                if (prev) {
                    prev.groups = [];
                    prev.contacts = [];
                    prev._groupMap = null;
                    prev._filteredCache = [];
                    prev._groupFilterCache = [];
                    prev.contactCount = 0;
                    prev.groupCount = 0;
                    prev.discoveryStats = null;
                    if (prev.selectedGroupIds) prev.selectedGroupIds.clear();
                }
            }

            activeExtractAccount = number
            window.api.setActiveAccount(number) // Force the pipeline to swap

            // TITAN CLEAN SLATE: Wipe the new account's local state too.
            // This forces the user to click "Sync" for a fresh, crash-free experience.
            const current = accounts.get(number);
            if (current) {
                current.groups = [];
                current.contacts = [];
                current._groupMap = null;
                current._filteredCache = [];
                current._groupFilterCache = [];
                current.contactCount = 0;
                current.groupCount = 0;
                current.discoveryStats = null;
                if (current.selectedGroupIds) current.selectedGroupIds.clear();
                current.state = STATES.LOGGED_IN;
            }

            // Force panels to rebuild for the new account context
            const lpNode = document.getElementById('lp-node');
            if (lpNode) delete lpNode.dataset.boundAcc;
            const rpNode = document.getElementById('rp-node');
            if (rpNode) delete rpNode.dataset.boundAcc;

            render()
        })
    })

    // setupWorkspaceListeners(container, currentAcc) // REMOVED: Redundant, panels setup themselves during render
}

function renderWorkspace(container, acc, token) {
    if (token !== _renderToken) return

    // --- TITAN: Disconnected/Error Handling ---
    if (acc.state === STATES.DISCONNECTED || acc.state === STATES.ERROR || acc.state === STATES.LOGGING_IN) {
        let title = "Session Terminated"
        let msg = "The WhatsApp Web connection for this worker was closed."
        let btnText = "Reconnect Worker"
        let icon = "⚡"

        if (acc.state === STATES.ERROR) {
            title = "Worker Connection Error"
            msg = acc.error || "A problem occurred while connecting to the browser."
            btnText = "Restart Connection"
            icon = "❌"
        } else if (acc.state === STATES.LOGGING_IN) {
            title = "Connecting..."
            msg = "Establishing connection with WhatsApp Web. Please wait or check the Devices section for the QR code."
            btnText = "Force Reset"
            icon = "⏳"
        }

        container.innerHTML = `
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#fff; border-radius:16px; border:1px solid var(--border-light); padding:60px; text-align:center;">
                <div style="font-size:48px; margin-bottom:16px;">${icon}</div>
                <h3 style="margin:0 0 8px 0; font-size:22px; font-weight:800; color:var(--text-main);">${title}</h3>
                <p style="color:var(--text-muted); margin:0 32px 32px 32px; font-size:14px; line-height:1.6; max-width:400px;">${msg}</p>
                <button class="btn-primary" onclick="window.api.startAddAccount('${acc.number}'); render();" style="padding:14px 40px; border-radius:12px; font-weight:800;">${btnText}</button>
            </div>
        `
        return
    }

    // --- TITAN SHIELD: Workspace Persistence ---
    let lp = container.querySelector('#lp-node')
    let rp = container.querySelector('#rp-node')

    if (!lp || !rp) {
        container.innerHTML = ''
        lp = document.createElement('div')
        lp.id = 'lp-node'
        lp.style.cssText = 'display:flex; flex-direction:column; overflow:hidden; flex-shrink:0; width:340px; height:100%;'
        rp = document.createElement('div')
        rp.id = 'rp-node'
        rp.style.cssText = 'flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0;'
        container.appendChild(lp)
        container.appendChild(rp)
    }

    renderGroupsPanel(lp, acc, token)
    renderContactsPanel(rp, acc, token)

    // Ensure listeners are bound to the (potentially) new DOM nodes/account context
    setupWorkspaceListeners(container, acc)
}

function setupWorkspaceListeners(container, acc) {
    const lp = document.getElementById('lp-node')
    const rp = document.getElementById('rp-node')
    // We re-bind listeners even if nodes exist to ensure context (acc) is fresh
    if (lp) setupGroupsPanelListeners(lp, acc)
    if (rp) setupContactsPanelListeners(rp, acc)
}

function setupGroupsPanelListeners(container, acc) {
    const search = container.querySelector('#group-search')
    const selectAll = container.querySelector('#select-all-groups')
    const startBtn = container.querySelector('#start-extract-btn')

    // TITAN SAFETY: Ensure data structures exist
    if (!acc.selectedGroupIds) acc.selectedGroupIds = new Set()
    const getSafeGroups = () => Array.isArray(acc.groups) ? acc.groups : []

    if (search) {
        search.oninput = e => {
            const freshAcc = accounts.get(acc.number) || acc
            freshAcc.groupSearchQuery = e.target.value
            render()
        }
    }
    if (selectAll) {
        selectAll.onchange = e => {
            const freshAcc = accounts.get(acc.number) || acc

            // TITAN VALIDATION: Block Select All if no groups have been synced yet
            if (!freshAcc.groups || freshAcc.groups.length === 0) {
                e.target.checked = false;
                // TITAN: Ensure backend selection is also killed
                window.api.selectAllGroups(freshAcc.number, false);
                window.titanAlert('Sync Required', 'Please click on ↻ Sync Active first to load your groups.');
                return;
            }

            if (!freshAcc.selectedGroupIds) freshAcc.selectedGroupIds = new Set()

            const groups = Array.isArray(freshAcc.groups) ? freshAcc.groups : []
            const q = (freshAcc.groupSearchQuery || '').toLowerCase()

            // TITAN OPTIMIZATION: Use cached filter if available
            let filtered = freshAcc._groupFilterCache
            if (!filtered || freshAcc._lastGroupFilterKey !== `${groups.length}|${q}`) {
                filtered = groups.filter(g => g && String(g.name || 'Unnamed').toLowerCase().includes(q))
                // Update cache for next time
                freshAcc._groupFilterCache = filtered
                freshAcc._lastGroupFilterKey = `${groups.length}|${q}`
            }

            if (e.target.checked) {
                for (let i = 0; i < filtered.length; i++) {
                    const g = filtered[i];
                    if (g && g.id) freshAcc.selectedGroupIds.add(g.id);
                }
            } else {
                freshAcc.selectedGroupIds.clear();
            }
            // Reset "Done" state so user can re-extract
            if (freshAcc.state === STATES.EXTRACTION_DONE) {
                freshAcc.state = STATES.GROUPS_READY;
            }
            window.api.selectAllGroups(freshAcc.number, e.target.checked);
            render()
        }
    }
    if (startBtn) {
        startBtn.onclick = async () => {
            const freshAcc = accounts.get(acc.number) || acc
            if (!freshAcc.selectedGroupIds) freshAcc.selectedGroupIds = new Set()

            // TITAN SAFETY: Prune stale selections that reference groups no longer in the list
            const validIds = new Set((freshAcc.groups || []).map(g => g.id));
            for (const id of freshAcc.selectedGroupIds) {
                if (!validIds.has(id)) freshAcc.selectedGroupIds.delete(id);
            }

            if (freshAcc.selectedGroupIds.size === 0) return window.titanAlert('Selection Required', 'Select at least one group first.')

            // --- STRICT FLOW: BLOCK IF DATA EXISTS ---
            if (freshAcc.contacts && freshAcc.contacts.length > 0) {
                window.titanAlert("Extraction Blocked", `You already have ${freshAcc.contacts.length.toLocaleString()} contacts. Clear the list first.`)
                return;
            }
            // --- TITAN LICENSE CHECK ---
            if (window.TITAN_LICENSE && !window.TITAN_LICENSE.valid) {
                return window.titanAlert("License Required", "You must authorize this hardware with a valid license key to perform extractions.")
            }

            // --- DAILY LIMIT CHECK ---
            if (window.TITAN_LICENSE && window.TITAN_LICENSE.daily_extract_limit > 0) {
                const status = await window.api.getLicenseStatus();
                const usage = await window.api.getUsage();
                if (usage.contacts_extracted >= window.TITAN_LICENSE.daily_extract_limit) {
                    return window.titanAlert("Daily Limit Reached", `You have reached your daily extraction limit (${usage.contacts_extracted}/${window.TITAN_LICENSE.daily_extract_limit}). Resets at midnight.`)
                }
            }


            window.showTitanBanner(`Starting extraction for ${freshAcc.selectedGroupIds.size} groups...`, 'info')
            freshAcc.state = STATES.EXTRACTING
            render()
            window.api.startExtraction(freshAcc.number, Array.from(freshAcc.selectedGroupIds))
        }
    }
}

function setupContactsPanelListeners(container, acc) {
    const search = container.querySelector('#contact-search')
    const exportBtn = container.querySelector('#export-excel-btn')
    const exclusionBtn = container.querySelector('#import-exclusion-btn')

    if (search) {
        // TITAN DEBOUNCE: Wait 300ms after last keystroke before searching 400k contacts
        let searchTimeout;
        search.oninput = e => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                acc.searchQuery = e.target.value
                render()
            }, 300);
        }
    }

    // Tools logic is handled by event delegation in renderContactsPanel for stability
}

function renderGroupsPanel(container, acc, token) {
    if (token !== _renderToken) return
    if (!acc.selectedGroupIds) acc.selectedGroupIds = new Set()
    const allGroups = Array.isArray(acc.groups) ? acc.groups : []
    const q = (acc.groupSearchQuery || '').toLowerCase()
    const isExt = acc.state === STATES.EXTRACTING
    const prog = acc.progress
    const isSyncing = acc.discoveryStats?.loading

    const existingSearch = container.querySelector('#group-search')
    const isNewAcc = container.dataset.boundAcc !== acc.number

    if (!existingSearch || isNewAcc) {
        container.dataset.boundAcc = acc.number
        container.innerHTML = ''
        const card = document.createElement('div')
        card.style.cssText = 'background:#fff; border:1px solid var(--border-light); border-radius:14px; padding:20px; display:flex; flex-direction:column; gap:14px; overflow:hidden; width:340px; flex-shrink:0; height:100%;'
        card.innerHTML = `
          <!-- Panel header -->
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div id="group-count-header" style="font-size:15px; font-weight:800; color:var(--text-main);">Groups (${allGroups.length})</div>
              <div id="sync-status" style="font-size:11px; color:var(--primary); font-weight:600; display:none; margin-top:2px;">🔄 Syncing...</div>
            </div>
            <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:var(--text-muted); cursor:pointer;">
              <input type="checkbox" id="select-all-groups" style="cursor:pointer; accent-color:var(--primary);"> All
            </label>
          </div>
          <!-- Search -->
          <input type="text" id="group-search" placeholder="Search groups..."
                 style="width:100%; box-sizing:border-box; padding:9px 12px; border:1.5px solid var(--border-light); border-radius:9px; font-size:13px; outline:none; font-family:inherit; transition:border-color 0.2s;"
                 onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border-light)'">
          <!-- Groups list -->
          <div id="groups-list" style="flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:3px;"></div>
          <!-- Extract button -->
          <button id="start-extract-btn" class="btn-primary" style="width:100%; padding:12px; font-size:13px; font-weight:700;"></button>
        `
        container.appendChild(card)
        setupGroupsPanelListeners(container, acc)
    }

    // Surgical updates
    const searchInp = container.querySelector('#group-search')
    if (document.activeElement !== searchInp) searchInp.value = acc.groupSearchQuery || ''

    const countHead = container.querySelector('#group-count-header')
    if (countHead) countHead.innerText = `Groups (${allGroups.length})`

    container.querySelector('#sync-status').style.display = isSyncing ? 'block' : 'none'

    const extBtn = container.querySelector('#start-extract-btn')
    const isDone = acc.state === STATES.EXTRACTION_DONE
    const selCount = acc.selectedGroupIds.size;

    if (isExt) {
        const current = prog?.groupIndex ?? 0
        const total = prog?.groupTotal ?? 0
        extBtn.innerText = `Extracting... (${current}/${total})`
        extBtn.classList.add('extracting-pulse')
    } else if (isDone) {
        extBtn.innerText = 'Extraction Complete ✅'
        extBtn.classList.remove('extracting-pulse')
    } else {
        extBtn.innerText = selCount > 0 ? `Extract ${selCount} Group${selCount > 1 ? 's' : ''}` : 'Select Groups to Extract'
        extBtn.classList.remove('extracting-pulse')
    }
    extBtn.style.fontSize = '14px'
    extBtn.style.fontWeight = '800'
    extBtn.disabled = isExt

    const selectAllBox = container.querySelector('#select-all-groups')
    const listContainer = container.querySelector('#groups-list')

    // --- TITAN OPTIMIZATION: Memoized Group Filtering ---
    const groupFilterKey = `${acc.groups?.length || 0}|${q}`
    if (acc._lastGroupFilterKey !== groupFilterKey) {
        acc._groupFilterCache = allGroups.filter(g => g && String(g.name || 'Unnamed Group').toLowerCase().includes(q))
        acc._lastGroupFilterKey = groupFilterKey
    }
    const filteredGroups = acc._groupFilterCache || []

    if (selectAllBox) {
        // Quantum check: If selected count is >= visible count, assume checked (O(1) vs O(N))
        // This is safe because selections are usually made via this checkbox or individual clicks
        selectAllBox.checked = filteredGroups.length > 0 && acc.selectedGroupIds.size >= filteredGroups.length
    }

    if (filteredGroups.length === 0) {
        listContainer.innerHTML = `<div style="text-align:center; padding:40px 20px; color:var(--text-muted); font-size:13px;">${allGroups.length === 0 ? 'Click ↻ Sync to load groups' : 'No groups match your search'}</div>`
        return
    }

    // --- TITAN VIRTUALIZATION: Groups List (Quantum Logic) ---
    const rowHeight = 36
    const renderVirtualGroups = () => {
        if (token !== _renderToken) return // Abort stale scroll events

        const scrollTop = listContainer.scrollTop
        const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - 8)
        const endIdx = Math.min(filteredGroups.length, Math.ceil((scrollTop + listContainer.clientHeight) / rowHeight) + 12)

        const fragment = document.createDocumentFragment()

        if (startIdx > 0) {
            const spacer = document.createElement('div')
            spacer.style.height = `${startIdx * rowHeight}px`
            fragment.appendChild(spacer)
        }

        for (let i = startIdx; i < endIdx; i++) {
            const g = filteredGroups[i]
            if (!g) continue
            const isChecked = acc.selectedGroupIds.has(g.id)
            const row = document.createElement('div')
            row.style.cssText = `display:flex; align-items:center; height:${rowHeight}px; padding:0 10px; border-radius:8px; font-size:13px; cursor:pointer; transition:background 0.1s; background:${isChecked ? '#eff6ff' : 'transparent'}; border:1px solid ${isChecked ? '#bfdbfe' : 'transparent'}; box-sizing:border-box;`
            row.innerHTML = `
                <input type="checkbox" class="group-check" data-id="${g.id}" style="margin-right:10px; pointer-events:none; accent-color:var(--primary); flex-shrink:0;" ${isChecked ? 'checked' : ''}>
                <div style="flex:1; font-weight:600; color:var(--text-main); font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${g.name || 'Unnamed Group'}</div>
                <div style="font-size:11px; color:var(--text-muted); font-weight:600; flex-shrink:0; margin-left:8px;">${(g.participantCount || 0).toLocaleString()}</div>
            `
            row.onclick = () => {
                const freshAcc = accounts.get(acc.number) || acc
                const isSelected = !freshAcc.selectedGroupIds.has(g.id)
                if (isSelected) freshAcc.selectedGroupIds.add(g.id)
                else freshAcc.selectedGroupIds.delete(g.id)

                if (freshAcc.state === STATES.EXTRACTION_DONE) {
                    freshAcc.state = STATES.GROUPS_READY;
                }

                window.api.toggleGroupSelection(freshAcc.number, g.id, isSelected)
                render()
            }
            fragment.appendChild(row)
        }

        const remaining = filteredGroups.length - endIdx
        if (remaining > 0) {
            const spacer = document.createElement('div')
            spacer.style.height = `${remaining * rowHeight}px`
            fragment.appendChild(spacer)
        }

        listContainer.innerHTML = ''
        listContainer.appendChild(fragment)
    }

    renderVirtualGroups()
    listContainer.onscroll = renderVirtualGroups
}



function renderContactsPanel(container, acc, token) {
    if (token !== _renderToken) return
    // --- TITAN OPTIMIZATION: Memoized Filtering ---
    const allContacts = acc.contacts || []
    const searchQuery = (acc.searchQuery || '').toLowerCase()

    // Only re-filter if state changed (Identity check + Search + Count)
    const filterKey = `${acc._lastUpdate || 0}|${allContacts.length}|${searchQuery}`
    if (acc._lastFilterKey !== filterKey) {
        if (!searchQuery) {
            acc._filteredCache = allContacts;
        } else {
            acc._filteredCache = allContacts.filter(c => {
                const p = String(c.phone || '').toLowerCase()
                const n = String(c.name || '').toLowerCase()
                const g = String(c.groupSource || '').toLowerCase()
                return p.includes(searchQuery) || n.includes(searchQuery) || g.includes(searchQuery)
            })
        }
        acc._lastFilterKey = filterKey
    }
    const filtered = acc._filteredCache

    // --- TITAN SHIELD: Search Persistence & Context Check ---
    const existingSearch = container.querySelector('#contact-search')
    const isNewAcc = container.dataset.boundAcc !== acc.number

    if (!existingSearch || isNewAcc) {
        container.dataset.boundAcc = acc.number
        container.innerHTML = ''
        const div = document.createElement('div')
        div.style.cssText = 'background:#fff; border:1px solid var(--border-light); border-radius:14px; padding:20px; flex:1; display:flex; flex-direction:column; gap:14px; overflow:hidden; min-width:0; height:100%;'
        const isAllSelected = filtered.length > 0 && acc.selectedContactIds?.size >= filtered.length
        div.innerHTML = `
        <!-- Header -->
        <div style="display:flex; justify-content:flex-end; align-items:center;">
           <div style="display:flex; gap:8px; align-items:center;">
              <!-- Search -->
              <input type="text" id="contact-search" placeholder="🔍 Search contacts..." style="padding:8px 12px; border:1.5px solid var(--border-light); border-radius:8px; font-size:12px; width:170px; outline:none; font-family:inherit;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border-light)'">

              <!-- Tools Dropdown -->
              <div class="titan-dd" style="position:relative;">
                <button class="titan-dd-trigger" style="display:flex; align-items:center; gap:6px; padding:8px 14px; border:1.5px solid var(--border-light); background:#fff; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; color:var(--text-main); transition:all 0.15s;">
                  🛠 Tools <span style="font-size:10px; color:var(--text-muted);">▾</span>
                </button>
                <div class="titan-dd-menu" style="display:none; position:absolute; right:0; top:calc(100% + 6px); background:#fff; border:1px solid var(--border-light); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.12); min-width:200px; z-index:500; overflow:hidden; opacity:0; transform:translateY(-6px); transition:opacity 0.15s, transform 0.15s;">
                  <div style="padding:6px;">
                    <button id="import-exclusion-btn" class="titan-dd-item" style="width:100%; text-align:left; padding:9px 12px; border:none; background:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:var(--text-main); display:flex; align-items:center; gap:10px;">📥 <span>Import Exclusion List</span></button>
                    <div style="height:1px; background:#f1f5f9; margin:4px 0;"></div>
                    <button id="wipe-invalids-btn" class="titan-dd-item" style="width:100%; text-align:left; padding:9px 12px; border:none; background:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:var(--text-main); display:flex; align-items:center; gap:10px;">🧹 <span>Wipe Invalid Numbers</span></button>
                    <button id="wipe-admins-btn" class="titan-dd-item" style="width:100%; text-align:left; padding:9px 12px; border:none; background:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:var(--text-main); display:flex; align-items:center; gap:10px;">🧹 <span>Wipe Admins</span></button>
                    <div style="height:1px; background:#f1f5f9; margin:4px 0;"></div>
                    <button id="delete-selected-btn" class="titan-dd-item titan-dd-danger" style="width:100%; text-align:left; padding:9px 12px; border:none; background:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#ef4444; display:flex; align-items:center; gap:10px;">🗑 <span>Delete Selected</span></button>
                    <button id="clear-contacts-btn" class="titan-dd-item titan-dd-danger" style="width:100%; text-align:left; padding:9px 12px; border:none; background:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:#ef4444; display:flex; align-items:center; gap:10px;">🗑 <span>Clear All Contacts</span></button>
                  </div>
                </div>
              </div>

              <!-- Export Dropdown -->
              <div class="titan-dd" style="position:relative;">
                <button class="titan-dd-trigger btn-primary" style="display:flex; align-items:center; gap:6px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer; border-radius:8px; border:none;">
                  💾 Export <span style="font-size:10px; opacity:0.8;">▾</span>
                </button>
                <div class="titan-dd-menu" style="display:none; position:absolute; right:0; top:calc(100% + 6px); background:#fff; border:1px solid var(--border-light); border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.12); min-width:200px; z-index:500; overflow:hidden; opacity:0; transform:translateY(-6px); transition:opacity 0.15s, transform 0.15s;">
                  <div style="padding:6px;">
                    <button id="export-all-btn" class="titan-dd-item" style="width:100%; text-align:left; padding:9px 12px; border:none; background:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:var(--text-main); display:flex; align-items:center; gap:10px;">📊 <span>All Contacts (Merged)</span></button>
                    <button id="export-admins-btn" class="titan-dd-item" style="width:100%; text-align:left; padding:9px 12px; border:none; background:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:var(--text-main); display:flex; align-items:center; gap:10px;">👮 <span>Admins Only</span></button>
                    <button id="export-split-btn" class="titan-dd-item" style="width:100%; text-align:left; padding:9px 12px; border:none; background:none; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; color:var(--text-main); display:flex; align-items:center; gap:10px;">📂 <span>Split by Groups</span></button>
                  </div>
                </div>
              </div>
           </div>
        </div>
        <!-- Stat Banners -->
        <div id="stat-banners" style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; flex-shrink:0;">
          <div style="background:linear-gradient(135deg,#3b82f6,#2563eb); border-radius:10px; padding:10px 14px; color:#fff;">
            <div id="stat-total" style="font-size:18px; font-weight:800; letter-spacing:-0.03em; line-height:1;">${allContacts.length.toLocaleString()}</div>
            <div style="font-size:10px; font-weight:600; opacity:0.85; margin-top:3px; text-transform:uppercase; letter-spacing:0.05em;">Total Contacts</div>
          </div>
          <div style="background:linear-gradient(135deg,#f59e0b,#d97706); border-radius:10px; padding:10px 14px; color:#fff;">
            <div id="stat-admins" style="font-size:18px; font-weight:800; letter-spacing:-0.03em; line-height:1;">${allContacts.filter(c => c.isAdmin).length.toLocaleString()}</div>
            <div style="font-size:10px; font-weight:600; opacity:0.85; margin-top:3px; text-transform:uppercase; letter-spacing:0.05em;">Admins</div>
          </div>
          <div style="background:linear-gradient(135deg,#8b5cf6,#7c3aed); border-radius:10px; padding:10px 14px; color:#fff;">
            <div id="stat-groups" style="font-size:18px; font-weight:800; letter-spacing:-0.03em; line-height:1;">${new Set(allContacts.map(c => c.sourceGroupId).filter(Boolean)).size}</div>
            <div style="font-size:10px; font-weight:600; opacity:0.85; margin-top:3px; text-transform:uppercase; letter-spacing:0.05em;">Groups Extracted</div>
          </div>
          <div style="background:linear-gradient(135deg,#22c55e,#16a34a); border-radius:10px; padding:10px 14px; color:#fff;">
            <div id="stat-selected" style="font-size:18px; font-weight:800; letter-spacing:-0.03em; line-height:1;">${(acc.selectedContactIds?.size || 0).toLocaleString()}</div>
            <div style="font-size:10px; font-weight:600; opacity:0.85; margin-top:3px; text-transform:uppercase; letter-spacing:0.05em;">Selected</div>
          </div>
        </div>
        <!-- Table -->

        <div id="table-scroller" style="flex:1; min-height:0; overflow-y:auto; border:1px solid var(--border-light); border-radius:10px; background:#fff;">
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead style="background:#f8fafc; position:sticky; top:0; font-weight:700; text-align:left; border-bottom:2px solid var(--border-light); z-index:10;">
                <tr>
                    <th style="padding:12px; width:40px; text-align:center;">
                        <input type="checkbox" id="select-all-contacts" style="accent-color:var(--primary);" ${isAllSelected ? 'checked' : ''}>
                    </th>
                    <th style="padding:12px; color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Phone</th>
                    <th style="padding:12px; color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Name</th>
                    <th style="padding:12px; color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Group</th>
                    <th style="padding:12px; color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Type</th>
                </tr>
            </thead>
            <tbody id="contacts-table-body"></tbody>
          </table>
        </div>
        <input type="file" id="exclusion-file" style="display:none;" accept=".xlsx,.xls,.csv">
      `
        container.appendChild(div)

        div.querySelector('#contact-search').addEventListener('input', e => { acc.searchQuery = e.target.value; render() })

        // ---- Dropdown toggle logic ----
        div.querySelectorAll('.titan-dd').forEach(dd => {
            const trigger = dd.querySelector('.titan-dd-trigger')
            const menu = dd.querySelector('.titan-dd-menu')

            trigger.addEventListener('click', (e) => {
                e.stopPropagation()
                const isOpen = menu.style.display === 'block'
                // Close all other dropdowns first
                div.querySelectorAll('.titan-dd-menu').forEach(m => {
                    m.style.display = 'none'; m.style.opacity = '0'; m.style.transform = 'translateY(-6px)'
                })
                if (!isOpen) {
                    menu.style.display = 'block'
                    requestAnimationFrame(() => { menu.style.opacity = '1'; menu.style.transform = 'translateY(0)' })
                }
            })

            // Close menu after item click
            menu.querySelectorAll('.titan-dd-item').forEach(item => {
                item.addEventListener('click', () => {
                    menu.style.opacity = '0'; menu.style.transform = 'translateY(-6px)'
                    setTimeout(() => { menu.style.display = 'none' }, 150)
                })
            })
        })

        // Close on outside click
        document.addEventListener('click', function closeDDs() {
            div.querySelectorAll('.titan-dd-menu').forEach(m => {
                m.style.opacity = '0'; m.style.transform = 'translateY(-6px)'
                setTimeout(() => { m.style.display = 'none' }, 150)
            })
        })

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                div.querySelectorAll('.titan-dd-menu').forEach(m => {
                    m.style.opacity = '0'; m.style.transform = 'translateY(-6px)'
                    setTimeout(() => { m.style.display = 'none' }, 150)
                })
            }
        })

        // TITAN SHIELD: Robust Event Delegation for Tools & Export
        div.addEventListener('click', async (e) => {
            const freshAcc = accounts.get(acc.number) || acc

            // TITAN OPTIMIZATION: Checkbox special handling for O(1) Deselect
            if (e.target.id === 'select-all-contacts') {
                if (!freshAcc.selectedContactIds) freshAcc.selectedContactIds = new Set();
                const isChecked = e.target.checked;

                if (!isChecked) {
                    // O(1) Nuclear Clear - Instant even for 400k
                    freshAcc.selectedContactIds.clear();
                } else {
                    // O(N) but chunked to prevent freeze
                    const filtered = freshAcc._filteredCache || []
                    const batchSize = 10000;
                    for (let i = 0; i < filtered.length; i++) {
                        const c = filtered[i];
                        freshAcc.selectedContactIds.add(`${c.phone}|${c.sourceGroupId}`);
                        // Yield to UI thread every 10k items
                        if (i % batchSize === 0 && i > 0) await new Promise(r => setTimeout(r, 0));
                    }
                }
                render();
                return;
            }

            const btn = e.target.closest('button')
            if (!btn || !btn.id) return

            if (btn.id === 'wipe-invalids-btn') {
                const oldLen = (freshAcc.contacts || []).length
                // TITAN ENFORCEMENT: Only keep numbers between 10 and 12 digits.
                freshAcc.contacts = (freshAcc.contacts || []).filter(c => /^\+?\d{10,12}$/.test(c.phone))
                const purged = oldLen - freshAcc.contacts.length
                if (purged === 0) return titanAlert("Cleanup", "No invalid contact items found (10-12 digit range).")
                await titanAlert("Cleanup", `Purged ${purged.toLocaleString()} entries outside 10-12 digit range.`); render()
            }

            if (btn.id === 'wipe-admins-btn') {
                const oldLen = (freshAcc.contacts || []).length
                freshAcc.contacts = (freshAcc.contacts || []).filter(c => !c.isAdmin)
                const purged = oldLen - freshAcc.contacts.length
                if (purged === 0) return titanAlert("Cleanup", "No admins found in this list.")
                await titanAlert("Cleanup", `Removed ${purged.toLocaleString()} admins.`); render()
            }

            if (btn.id === 'clear-contacts-btn') {
                if (await titanConfirm('Clear Extracted Data', 'Wipe all extracted contacts? Your discovered groups will stay visible.')) {
                    // TITAN CLEAN RESET: Wipe contacts, keep groups
                    freshAcc.contacts = []
                    // freshAcc.groups stays unchanged
                    freshAcc.contactCount = 0
                    freshAcc.searchQuery = ''
                    freshAcc._lastUpdate = Date.now()
                    freshAcc._lastFilterKey = null
                    freshAcc._filteredCache = []
                    freshAcc._lastStatsKey = null
                    freshAcc._cachedStats = { total: 0, admins: 0, groups: 0 }

                    // Keep the state as GROUPS_READY so the UI doesn't think we need a new sync
                    if (freshAcc.groups && freshAcc.groups.length > 0) {
                        freshAcc.state = STATES.GROUPS_READY
                    } else {
                        freshAcc.state = STATES.LOGGED_IN
                    }

                    if (freshAcc.selectedContactIds) freshAcc.selectedContactIds.clear()

                    // Force ONLY the right panel to rebuild (contacts list)
                    const rpNode = document.getElementById('rp-node');
                    if (rpNode) delete rpNode.dataset.boundAcc;

                    window.api.clearAllData(freshAcc.number)
                    render()
                }
            }

            if (btn.id === 'delete-selected-btn') {
                if (!freshAcc.selectedContactIds || freshAcc.selectedContactIds.size === 0) return titanAlert("Selection", "No contacts selected.")
                if (await titanConfirm('Delete Selected', `Delete ${freshAcc.selectedContactIds.size} selected contacts?`)) {
                    freshAcc.contacts = (freshAcc.contacts || []).filter(c => !freshAcc.selectedContactIds.has(`${c.phone}|${c.sourceGroupId}`))
                    freshAcc.selectedContactIds.clear()
                    render()
                }
            }

            if (btn.id === 'export-all-btn') {
                if (!freshAcc.contacts || freshAcc.contacts.length === 0) return titanAlert("Export Empty", "No contacts to export.")
                const expCheck = await titanTrialLimitCheck('export')
                if (!expCheck.allowed) { showUpgradeBanner('export'); return }
                const slice = freshAcc.contacts.slice(0, expCheck.remaining === Infinity ? undefined : expCheck.remaining)
                await titanTrialConsume('export', slice.length)
                if (expCheck.remaining !== Infinity && expCheck.remaining < freshAcc.contacts.length) {
                    window.showTitanBanner(`Trial: Exporting ${slice.length} of ${freshAcc.contacts.length} contacts (daily limit: ${TRIAL_EXPORT_LIMIT}).`, 'warning')
                }
                window.api.exportToExcel({ number: freshAcc.number, contacts: slice, mode: 'merged' })
            }

            if (btn.id === 'export-admins-btn') {
                const admins = (freshAcc.contacts || []).filter(c => c.isAdmin)
                if (admins.length === 0) return titanAlert("Export Empty", "No admins found to export.")
                const expCheck = await titanTrialLimitCheck('export')
                if (!expCheck.allowed) { showUpgradeBanner('export'); return }
                const slice = admins.slice(0, expCheck.remaining === Infinity ? undefined : expCheck.remaining)
                await titanTrialConsume('export', slice.length)
                if (expCheck.remaining !== Infinity && expCheck.remaining < admins.length) {
                    window.showTitanBanner(`Trial: Exporting ${slice.length} of ${admins.length} admins (daily limit: ${TRIAL_EXPORT_LIMIT}).`, 'warning')
                }
                window.api.exportToExcel({ number: freshAcc.number, contacts: slice, mode: 'admins_only' })
            }

            if (btn.id === 'export-split-btn') {
                if (!freshAcc.contacts || freshAcc.contacts.length === 0) return titanAlert("Export Empty", "No contacts to export.")
                const expCheck = await titanTrialLimitCheck('export')
                if (!expCheck.allowed) { showUpgradeBanner('export'); return }
                const slice = freshAcc.contacts.slice(0, expCheck.remaining === Infinity ? undefined : expCheck.remaining)
                await titanTrialConsume('export', slice.length)
                if (expCheck.remaining !== Infinity && expCheck.remaining < freshAcc.contacts.length) {
                    window.showTitanBanner(`Trial: Exporting ${slice.length} of ${freshAcc.contacts.length} contacts (daily limit: ${TRIAL_EXPORT_LIMIT}).`, 'warning')
                }
                window.api.exportToExcel({ number: freshAcc.number, contacts: slice, mode: 'split' })
            }

            if (btn.id === 'import-exclusion-btn') {
                div.querySelector('#exclusion-file').click()
            }
        })

        div.querySelector('#select-all-contacts').addEventListener('change', (e) => {
            const freshAcc = accounts.get(acc.number) || acc
            if (!freshAcc.selectedContactIds) freshAcc.selectedContactIds = new Set()

            if (e.target.checked) {
                // TITAN HIGH-SPEED SELECT: Use for-loop for 1M+ contact efficiency
                const len = filtered.length;
                for (let i = 0; i < len; i++) {
                    const c = filtered[i];
                    if (c) freshAcc.selectedContactIds.add(`${c.phone}|${c.sourceGroupId}`);
                }
            } else {
                const len = filtered.length;
                for (let i = 0; i < len; i++) {
                    const c = filtered[i];
                    if (c) freshAcc.selectedContactIds.delete(`${c.phone}|${c.sourceGroupId}`);
                }
            }
            render()
        })

        div.querySelector('#exclusion-file').addEventListener('change', (e) => {
            const file = e.target.files[0]
            if (file) {
                const filePath = window.api.getPathForFile(file)
                window.api.importExclusion({ filePath, number: acc.number })
            }
        })
    }

    // Surgical Update for Contact Count + Stat Banners
    const countLabel = container.querySelector('#contact-count-label')
    if (countLabel) countLabel.innerText = `${allContacts.length.toLocaleString()} contacts`

    // --- TITAN OPTIMIZATION: High-Speed Stats Pass ---
    const statsKey = `${allContacts.length}|${acc._lastUpdate || 0}`
    const isExtracting = acc.state === STATES.EXTRACTING;
    const statsThrottleMs = isExtracting ? 3000 : 500;
    const now = Date.now();

    if (acc._lastStatsKey !== statsKey && (now - (acc._lastStatsTime || 0)) > statsThrottleMs) {
        // TITAN TURBO LOOP: One pass over 400k contacts instead of 4 passes.
        // Avoids memory allocation of intermediate arrays (map/filter) which causes GC freeze.
        let adminCount = 0;
        const groupSet = new Set();
        for (let i = 0; i < allContacts.length; i++) {
            const c = allContacts[i];
            if (c.isAdmin) adminCount++;
            if (c.sourceGroupId) groupSet.add(c.sourceGroupId);
        }

        acc._cachedStats = {
            total: allContacts.length,
            admins: adminCount,
            groups: groupSet.size
        }
        acc._lastStatsKey = statsKey
        acc._lastStatsTime = now
    }
    const cs = acc._cachedStats

    const statTotal = container.querySelector('#stat-total')
    const statAdmins = container.querySelector('#stat-admins')
    const statGroups = container.querySelector('#stat-groups')
    const statSelected = container.querySelector('#stat-selected')
    if (statTotal) statTotal.innerText = cs.total.toLocaleString()
    if (statAdmins) statAdmins.innerText = cs.admins.toLocaleString()
    if (statGroups) statGroups.innerText = cs.groups.toLocaleString()
    if (statSelected) statSelected.innerText = (acc.selectedContactIds?.size || 0).toLocaleString()

    const searchInp = container.querySelector('#contact-search')

    // STRICT SYNC: If backend query is empty, force input to empty regardless of focus
    if (acc.searchQuery === '') {
        if (searchInp) searchInp.value = '';
    } else {
        if (searchInp && document.activeElement !== searchInp) searchInp.value = acc.searchQuery || ''
    }

    const tbody = container.querySelector('#contacts-table-body')
    const scroller = container.querySelector('#table-scroller')
    const rowHeight = 41
    let _lastScrollTop = -Infinity  // Use -Infinity so first render ALWAYS executes

    // Reset scroll if coming from a different context
    if (container.dataset.scrollReset !== acc.number) {
        if (scroller) scroller.scrollTop = 0;
        container.dataset.scrollReset = acc.number;
    }

    const renderVirtualRows = () => {
        if (token !== _renderToken) return // Abort stale scroll events

        const scrollTop = scroller.scrollTop
        if (Math.abs(scrollTop - _lastScrollTop) < 5 && filtered.length > 0) return
        _lastScrollTop = scrollTop

        const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - 10)
        const endIdx = Math.min(filtered.length, Math.ceil((scrollTop + scroller.clientHeight) / rowHeight) + 15)

        const fragment = document.createDocumentFragment()

        // Dynamic Padding Row (Top)
        if (startIdx > 0) {
            const tr = document.createElement('tr')
            tr.style.height = `${startIdx * rowHeight}px`
            fragment.appendChild(tr)
        }

        if (filtered.length === 0) {
            const tr = document.createElement('tr')
            const emptyTd = document.createElement('td')
            emptyTd.colSpan = 5
            emptyTd.style.padding = '40px'
            emptyTd.style.textAlign = 'center'
            emptyTd.innerText = 'No contacts found.'
            tr.appendChild(emptyTd)
            fragment.appendChild(tr)
        } else {
            for (let i = startIdx; i < endIdx; i++) {
                const c = filtered[i]
                if (!c) continue
                const cid = `${c.phone}|${c.sourceGroupId}`
                const tr = document.createElement('tr')
                tr.style = `height:${rowHeight}px; border-bottom:1px solid #edf2f7;`
                tr.innerHTML = `
                    <td style="padding:10px 12px; text-align:center; width:40px;"><input type="checkbox" class="contact-check" data-id="${cid}" ${acc.selectedContactIds?.has(cid) ? 'checked' : ''}></td>
                    <td style="padding:10px 12px; font-family:monospace; font-weight:600;">${c.phone}</td>
                    <td style="padding:10px 12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c.name || '-'}</td>
                    <td style="padding:10px 12px; color:var(--primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c.groupSource || '-'}</td>
                    <td style="padding:10px 12px; width:100px;"><span style="font-size:11px; padding:2px 6px; border-radius:4px; background:#f1f5f9;">${c.isAdmin ? 'Admin' : 'Member'}</span></td>
                `
                fragment.appendChild(tr)
            }
        }

        // Dynamic Padding Row (Bottom)
        const remaining = filtered.length - endIdx
        if (remaining > 0) {
            const tr = document.createElement('tr')
            tr.style.height = `${remaining * rowHeight}px`
            fragment.appendChild(tr)
        }

        tbody.innerHTML = ''
        tbody.appendChild(fragment)
    }

    // --- TITAN SURGICAL: Event Delegation for Virtual Checkboxes ---
    tbody.onclick = (e) => {
        if (e.target.classList.contains('contact-check')) {
            const cid = e.target.dataset.id
            if (!acc.selectedContactIds) acc.selectedContactIds = new Set()
            if (e.target.checked) acc.selectedContactIds.add(cid)
            else acc.selectedContactIds.delete(cid)

            // Sync "Select All" state visually
            const selectAllVal = filtered.length > 0 && filtered.every(c => acc.selectedContactIds.has(`${c.phone}|${c.sourceGroupId}`))
            const selectAllCheck = container.querySelector('#select-all-contacts')
            if (selectAllCheck) selectAllCheck.checked = selectAllVal
        }
    }

    renderVirtualRows()
    scroller.onscroll = () => {
        if (!_renderScheduled) {
            requestAnimationFrame(renderVirtualRows)
        }
    }
}

function renderPlaceholder(container, title) {
    container.innerHTML = `
    <div class="card" style="text-align:center; padding:80px;">
        <h2 style="margin:0;">${title}</h2>
        <p style="color:var(--text-muted);">This feature is currently under development.</p>
    </div>
  `
}

// ================= CAMPAIGN MANAGEMENT V4 (WIZARD) =================
let _campaignView = 'gallery' // 'gallery' | 'builder'

function renderSendingCenter(container) {
    if (_campaignView === 'builder' && _currentCampaignId) {
        renderCampaignBuilder(container)
    } else {
        renderCampaignGallery(container)
    }
}


function renderCampaignGallery(container) {
    const totalCamps = _campaignProjects.length
    const runningCamps = _campaignProjects.filter(c => c.status === 'RUNNING').length
    const draftCamps = _campaignProjects.filter(c => !c.status || c.status === 'DRAFT').length
    const doneCamps = _campaignProjects.filter(c => c.status === 'COMPLETED').length

    const statusCfg = {
        'DRAFT': { bg: 'linear-gradient(135deg,#f59e0b,#d97706)', label: 'DRAFT', dot: '#f59e0b' },
        'RUNNING': { bg: 'linear-gradient(135deg,#22c55e,#16a34a)', label: 'RUNNING', dot: '#22c55e' },
        'COMPLETED': { bg: 'linear-gradient(135deg,#3b82f6,#2563eb)', label: 'COMPLETED', dot: '#3b82f6' },
        'STOPPED': { bg: 'linear-gradient(135deg,#ef4444,#dc2626)', label: 'STOPPED', dot: '#ef4444' },
    }

    const cardsHtml = _campaignProjects.filter(c => c.status !== 'COMPLETED').length === 0
        ? `<div style="grid-column:1/-1; text-align:center; padding:80px 40px; background:#fff; border-radius:16px; border:2px dashed var(--border-light);">
            <div style="font-size:48px; margin-bottom:16px;">📨</div>
            <h3 style="margin:0 0 8px 0; font-size:18px; font-weight:700; color:var(--text-main);">No active campaigns</h3>
            <p style="color:var(--text-muted); font-size:14px; margin:0;">Click "New Campaign" to get started</p>
           </div>`
        : _campaignProjects.filter(c => c.status !== 'COMPLETED').map(c => {
            const st = statusCfg[c.status] || statusCfg['DRAFT']
            const activeCamp = _activeCampaigns.get(c.engineId)
            
            // TITAN FIX: Calculate true sent/failed by iterating target queue
            let sent = 0
            let failed = 0
            let pending = 0
            const activeLeads = activeCamp?.leads || c.leads || []
            activeLeads.forEach(l => {
                if (l.status === 'SENT') sent++
                else if (l.status === 'FAILED') failed++
                else pending++
            })
            
            const total = activeLeads.length
            const processed = sent + failed
            const pct = total > 0 ? Math.round((processed / total) * 100) : 0
            
            const isRunning = c.status === 'RUNNING'
            const timeAgo = c.created ? (() => {
                const diff = Date.now() - c.created
                if (diff < 60000) return 'just now'
                if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
                if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
                return new Date(c.created).toLocaleDateString()
            })() : ''
            return `
            <div class="campaign-card" data-id="${c.id}"
                 style="background:#fff; border-radius:16px; border:1px solid #e2e8f0; overflow:hidden; cursor:pointer; transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1); display:flex; flex-direction:column; box-shadow:0 2px 8px rgba(0,0,0,0.02);"
                 onmouseover="this.style.borderColor='var(--primary)';this.style.boxShadow='0 12px 32px rgba(59,130,246,0.12)';this.style.transform='translateY(-3px)'"
                 onmouseout="this.style.borderColor='#e2e8f0';this.style.boxShadow='0 2px 8px rgba(0,0,0,0.02)';this.style.transform='translateY(0)'">
              <!-- Color top stripe -->
              <div style="height:5px; background:${st.bg};"></div>
              <div style="padding:20px; flex:1; display:flex; flex-direction:column; gap:16px;">
                <!-- Status + date -->
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:10px; font-weight:800; color:#fff; background:${st.bg}; padding:4px 10px; border-radius:20px; letter-spacing:0.05em; display:flex; align-items:center; gap:6px; box-shadow:0 2px 6px ${st.dot}40;">
                      ${isRunning ? '<span style="width:6px; height:6px; background:#fff; border-radius:50%; animation:pulse-dot 2s infinite;"></span>' : ''}${st.label}
                  </span>
                  <span style="font-size:11px; color:var(--text-muted); font-weight:600;">${timeAgo}</span>
                </div>
                
                <!-- Name -->
                <div style="font-size:18px; font-weight:800; color:var(--text-main); letter-spacing:-0.02em; line-height:1.2;">${c.name}</div>
                
                <!-- Mini Stats row -->
                <div style="display:flex; gap:12px;">
                  <div style="display:flex; align-items:center; gap:6px; background:#f8fafc; padding:6px 10px; border-radius:8px; border:1px solid #f1f5f9;">
                      <span style="font-size:14px; opacity:0.8;">👥</span>
                      <span style="font-size:13px; color:var(--text-main); font-weight:800;">${total.toLocaleString()} <span style="color:var(--text-muted); font-weight:600;">leads</span></span>
                  </div>
                  <div style="display:flex; align-items:center; gap:6px; background:#f8fafc; padding:6px 10px; border-radius:8px; border:1px solid #f1f5f9;">
                      <span style="font-size:14px; opacity:0.8;">✉️</span>
                      <span style="font-size:13px; color:var(--text-main); font-weight:800;">${c.variants?.length || 1} <span style="color:var(--text-muted); font-weight:600;">variant${(c.variants?.length || 1) > 1 ? 's' : ''}</span></span>
                  </div>
                </div>
                
                ${isRunning ? `
                <!-- Advanced Metrics Grid -->
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px;">
                    <div style="text-align:center; background:#f0fdf4; border:1px solid #dcfce7; border-radius:10px; padding:10px 4px;">
                        <div style="font-size:18px; font-weight:900; color:#16a34a;">${sent}</div>
                        <div style="font-size:9px; font-weight:800; color:#15803d; text-transform:uppercase; margin-top:2px;">Sent</div>
                    </div>
                    <div style="text-align:center; background:#fffbeb; border:1px solid #fef3c7; border-radius:10px; padding:10px 4px;">
                        <div style="font-size:18px; font-weight:900; color:#d97706;">${pending}</div>
                        <div style="font-size:9px; font-weight:800; color:#b45309; text-transform:uppercase; margin-top:2px;">Pending</div>
                    </div>
                    <div style="text-align:center; background:#fef2f2; border:1px solid #fee2e2; border-radius:10px; padding:10px 4px;">
                        <div style="font-size:18px; font-weight:900; color:#dc2626;">${failed}</div>
                        <div style="font-size:9px; font-weight:800; color:#b91c1c; text-transform:uppercase; margin-top:2px;">Failed</div>
                    </div>
                </div>
                
                <!-- Progress bar -->
                <div>
                  <div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items:center;">
                    <span style="font-size:11px; font-weight:800; color:var(--text-main); text-transform:uppercase; letter-spacing:0.05em;">Execution Progress</span>
                    <span style="font-size:12px; font-weight:900; color:var(--primary);">${pct}%</span>
                  </div>
                  <div style="height:8px; background:#f1f5f9; border-radius:99px; overflow:hidden; border:1px solid #e2e8f0;">
                    <div style="height:100%; width:${pct}%; background:linear-gradient(90deg, #3b82f6, #60a5fa); border-radius:99px; transition:width 0.8s cubic-bezier(0.16, 1, 0.3, 1);"></div>
                  </div>
                </div>` : ''}
                <!-- Action buttons -->
                <div style="display:flex; gap:8px; margin-top:auto;">
                  <button class="open-campaign-btn btn-primary" data-id="${c.id}"
                          style="flex:1; font-size:12px; font-weight:700; padding:9px 0; border-radius:8px;">
                    ${isRunning ? 'Monitor' : (c.status === 'COMPLETED' ? 'View Report' : 'Open')}
                  </button>
                  <button class="delete-campaign-btn" data-id="${c.id}"
                          style="width:38px; height:38px; border-radius:10px; background:#ef4444; color:#fff; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s; flex-shrink:0;"
                          onmouseover="this.style.background='#dc2626';this.style.transform='scale(1.05)'"
                          onmouseout="this.style.background='#ef4444';this.style.transform='scale(1)'"
                          title="Delete Campaign">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>`
        }).join('')

    container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:20px; height:100%; overflow-y:auto;">
      <!-- Page Header -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-shrink:0;">
        <div>
          <div style="font-size:22px; font-weight:800; color:var(--text-main); letter-spacing:-0.02em;">Campaigns</div>
          <div style="font-size:13px; color:var(--text-muted); margin-top:2px;">Create and manage your outreach campaigns</div>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <input type="text" id="new-campaign-name" placeholder="Campaign name..."
                 style="padding:10px 14px; border:1.5px solid var(--border-light); border-radius:10px; font-weight:600; width:200px; font-size:13px; outline:none; font-family:inherit; color:var(--text-main); transition:border-color 0.2s;"
                 onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border-light)'">
          <button id="create-campaign-btn" class="btn-primary" style="padding:10px 20px; font-size:13px; font-weight:700; border-radius:10px;">+ New Campaign</button>
        </div>
      </div>

      <!-- Stat Banners -->
      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; flex-shrink:0;">
        <div class="stat-card" style="background:linear-gradient(135deg,#3b82f6,#2563eb); border-radius:10px; padding:14px 16px; color:#fff; cursor:pointer;" onclick="activeTab='reports'; render();">
          <div style="font-size:22px; font-weight:800; letter-spacing:-0.03em; line-height:1;">${totalCamps}</div>
          <div style="font-size:10px; font-weight:600; opacity:0.85; margin-top:3px; text-transform:uppercase; letter-spacing:0.05em;">Total</div>
        </div>
        <div id="stat-card-running" style="background:linear-gradient(135deg,#22c55e,#16a34a); border-radius:10px; padding:14px 16px; color:#fff; cursor:pointer; transition:transform 0.2s;" 
             onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
          <div style="font-size:22px; font-weight:800; letter-spacing:-0.03em; line-height:1;">${runningCamps}</div>
          <div style="font-size:10px; font-weight:600; opacity:0.85; margin-top:3px; text-transform:uppercase; letter-spacing:0.05em;">Running</div>
        </div>
        <div class="stat-card" style="background:linear-gradient(135deg,#f59e0b,#d97706); border-radius:10px; padding:14px 16px; color:#fff;">
          <div style="font-size:22px; font-weight:800; letter-spacing:-0.03em; line-height:1;">${draftCamps}</div>
          <div style="font-size:10px; font-weight:600; opacity:0.85; margin-top:3px; text-transform:uppercase; letter-spacing:0.05em;">Drafts</div>
        </div>
        <div class="stat-card" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed); border-radius:10px; padding:14px 16px; color:#fff; cursor:pointer;" onclick="activeTab='reports'; render();">
          <div style="font-size:22px; font-weight:800; letter-spacing:-0.03em; line-height:1;">${doneCamps}</div>
          <div style="font-size:10px; font-weight:600; opacity:0.85; margin-top:3px; text-transform:uppercase; letter-spacing:0.05em;">Completed</div>
        </div>
      </div>

      <!-- Campaign Cards Grid -->
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:16px; flex:1;">
        ${cardsHtml}
      </div>
    </div>`

    setupGalleryListeners(container)
}






function setupGalleryListeners(container) {
    container.querySelector('#create-campaign-btn').addEventListener('click', () => {
        const nameInput = container.querySelector('#new-campaign-name')
        const name = nameInput.value.trim()
        if (!name) {
            nameInput.style.borderColor = '#ef4444'
            nameInput.placeholder = 'Please enter a campaign name'
            nameInput.focus()
            setTimeout(() => { nameInput.style.borderColor = 'var(--border-light)'; nameInput.placeholder = 'Campaign name...' }, 2000)
            return
        }

        const newCamp = {
            id: `proj_${Date.now()}`,
            name,
            created: Date.now(),
            status: 'DRAFT',
            leads: [],
            variants: ["Hello {name}!"],
            rules: [],
            workerConfig: {},
            step: 'leads'
        }
        _campaignProjects.unshift(newCamp)
        _currentCampaignId = newCamp.id
        _stagedLeads = newCamp.leads
        _messageVariants = newCamp.variants
        _autoReplyRules = newCamp.rules
        _workerConfig = newCamp.workerConfig
        _innerSendTab = 'leads'
        _campaignView = 'builder'
        saveCurrentProject()
        container.innerHTML = ''
        render()
    })

    container.querySelectorAll('.open-campaign-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            const id = btn.dataset.id
            const camp = _campaignProjects.find(c => c.id === id)
            if (camp) {
                _currentCampaignId = id
                _stagedLeads = camp.leads || []
                _messageVariants = camp.variants || []
                _autoReplyRules = camp.rules || []
                _workerConfig = camp.workerConfig || {}
                _userDelayMin = Math.max(10, camp.delayMin || 60)
                _userDelayMax = Math.max(_userDelayMin + 10, camp.delayMax || 120)
                _userSleepThreshold = camp.sleepThreshold || 50
                _userSleepDuration = camp.sleepDuration || 15
                _attachedMedia = camp.attachedMedia || null
                _attachedMediaName = camp.attachedMediaName || ''
                _mediaSendMode = camp.mediaSendMode || 'text_only'
                // Land on 'launch' if running, otherwise 'leads'
                _innerSendTab = (camp.status === 'RUNNING') ? 'launch' : 'leads'
                _campaignView = 'builder'
                container.innerHTML = ''
                render()
            }
        })
    })

    container.querySelectorAll('.delete-campaign-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation()
            if (await titanConfirm('Delete Campaign', 'Are you sure you want to delete this campaign?')) {
                _campaignProjects = _campaignProjects.filter(c => c.id !== btn.dataset.id)
                window.api.configSave({ campaignProjects: _campaignProjects })
                render()
            }
        })
    })

    const runningCard = container.querySelector('#stat-card-running')
    if (runningCard) {
        runningCard.onclick = () => {
            if (_activeCampaigns.size > 0) {
                activeTab = 'campaigns'
                _campaignView = 'builder'
                _currentCampaignId = Array.from(_activeCampaigns.keys()).pop()
                _innerSendTab = 'launch'
                render()
            } else {
                window.showTitanBanner('No active campaigns running.', 'info')
            }
        }
    }
}

function saveCurrentProject() {
    if (_currentCampaignId) {
        const idx = _campaignProjects.findIndex(c => c.id === _currentCampaignId)
        if (idx !== -1) {
            // TITAN: Sync leads with live progress if campaign is active
            const active = _activeCampaigns.get(_currentCampaignId)
            if (active && active.leads) {
                _stagedLeads = active.leads
            }

            _campaignProjects[idx].leads = _stagedLeads || []
            _campaignProjects[idx].variants = _messageVariants || []
            _campaignProjects[idx].rules = _autoReplyRules || []
            _campaignProjects[idx].delayMin = _userDelayMin
            _campaignProjects[idx].delayMax = _userDelayMax
            _campaignProjects[idx].sleepThreshold = _userSleepThreshold
            _campaignProjects[idx].sleepDuration = _userSleepDuration
            _campaignProjects[idx].batchSize = _userBatchSize
            _campaignProjects[idx].step = _innerSendTab
            _campaignProjects[idx].attachedMedia = _attachedMedia
            _campaignProjects[idx].attachedMediaName = _attachedMediaName
            _campaignProjects[idx].mediaSendMode = _mediaSendMode
            window.api.configSave({ campaignProjects: _campaignProjects })
        }
    }
}

// ── WIZARD STEP CONFIG ──────────────────────────────────────────────────────
const WIZARD_STEPS = [
    { id: 'leads', label: 'Leads', num: 1 },
    { id: 'messages', label: 'Message', num: 2 },
    { id: 'config', label: 'Configuration', num: 3 },
    { id: 'launch', label: 'Launch', num: 4 },
]

function renderCampaignBuilder(container) {
    if (!_viewingCampaignId && _activeCampaigns.size > 0) {
        _viewingCampaignId = Array.from(_activeCampaigns.keys()).pop()
    }

    let queue = window._activeCampaignQueue || []
    if (_viewingCampaignId && _activeCampaigns.has(_viewingCampaignId)) {
        queue = _activeCampaigns.get(_viewingCampaignId).leads
    }
    const displayLeads = (_innerSendTab === 'leads') ? _stagedLeads : ((queue.length > 0) ? queue : _stagedLeads)
    const readyAccounts = Array.from(accounts.values()).filter(a =>
        a.state === STATES.LOGGED_IN || a.state === STATES.GROUPS_READY || a.state === STATES.EXTRACTION_DONE)
    const currentProject = _campaignProjects.find(c => c.id === _currentCampaignId)
    const isRunning = Array.from(_activeCampaigns.values()).some(c => ['RUNNING', 'WAITING', 'INITIALIZED'].includes(c.status))

    const stepIdx = WIZARD_STEPS.findIndex(s => s.id === _innerSendTab)
    const currentStep = WIZARD_STEPS[stepIdx] || WIZARD_STEPS[0]
    const prevStep = WIZARD_STEPS[stepIdx - 1]
    const nextStep = WIZARD_STEPS[stepIdx + 1]

    // ── Build step bar HTML ──
    const stepBarHtml = WIZARD_STEPS.map((s, i) => {
        const isDone = i < stepIdx
        const isActive = i === stepIdx
        const isFuture = i > stepIdx
        const lineColor = isDone ? '#3b82f6' : '#e2e8f0'
        const circleStyle = isDone
            ? 'background:#3b82f6; border:2px solid #3b82f6; color:#fff;'
            : isActive
                ? 'background:#fff; border:2.5px solid #3b82f6; color:#3b82f6;'
                : 'background:#fff; border:2px solid #e2e8f0; color:#94a3b8;'
        const labelStyle = isActive
            ? 'color:#3b82f6; font-weight:700;'
            : isDone ? 'color:#64748b; font-weight:600;' : 'color:#94a3b8; font-weight:500;'
        return `
        <div style="display:flex; align-items:center; flex:1;">
          <div style="display:flex; flex-direction:column; align-items:center; gap:6px; cursor:${isDone ? 'pointer' : 'default'};" class="wizard-step-dot" data-step="${s.id}">
            <div style="width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:800; transition:all 0.2s; ${circleStyle}">
              ${isDone ? '✓' : s.num}
            </div>
            <span style="font-size:11px; ${labelStyle} white-space:nowrap;">${s.label}</span>
          </div>
          ${i < WIZARD_STEPS.length - 1 ? `<div style="flex:1; height:2px; background:${lineColor}; margin:0 8px; margin-bottom:18px; transition:background 0.3s;"></div>` : ''}
        </div>`
    }).join('')

    // ── Status badge ──
    const statusColors = { DRAFT: '#f59e0b', RUNNING: '#22c55e', COMPLETED: '#3b82f6', STOPPED: '#ef4444' }
    const statusColor = statusColors[currentProject?.status] || '#f59e0b'

    // ── Bottom nav buttons ──
    const backBtn = prevStep
        ? `<button id="wizard-back-btn" class="btn-secondary" style="padding:10px 22px; font-size:13px; font-weight:700; border-radius:10px;">← ${prevStep.label}</button>`
        : `<div></div>`

    // Consolidate "Next" labels and restore "Launch" on final step
    const showLaunch = (_innerSendTab === 'config' && !isRunning)
    const nextBtn = nextStep
        ? `<button id="wizard-next-btn" class="btn-primary" style="padding:16px 48px; font-size:16px; font-weight:800; border-radius:12px; min-width:240px; box-shadow:0 8px 20px rgba(37,99,235,0.3); transition:all 0.2s;">Save and Continue →</button>`
        : showLaunch
            ? `<button id="wizard-launch-btn" class="btn-primary" style="padding:16px 48px; font-size:16px; font-weight:800; border-radius:12px; background:#22c55e; border:none; min-width:240px; box-shadow:0 8px 20px rgba(34,197,94,0.35); transition:all 0.2s;">🚀 Launch Campaign</button>`
            : ``

    // ── Check if builder shell already exists ──
    let shell = container.querySelector('.wizard-shell')
    if (!shell) {
        container.innerHTML = `
        <div class="wizard-shell" style="display:flex; flex-direction:column; height:100%; background:var(--bg-main);">

          <!-- Builder Header -->
          <div style="display:flex; align-items:center; gap:20px; padding:18px 32px; background:#fff; border-bottom:1px solid var(--border-light); flex-shrink:0;">
            <button id="wizard-back-to-gallery" style="display:flex; align-items:center; gap:8px; padding:11px 22px; border:1.5px solid var(--border-light); border-radius:12px; background:#fff; color:var(--text-muted); cursor:pointer; font-size:13px; font-weight:800; font-family:inherit; transition:all 0.15s;"
                    onmouseover="this.style.borderColor='var(--primary)';this.style.color='var(--primary)'"
                    onmouseout="this.style.borderColor='var(--border-light)';this.style.color='var(--text-muted)'">
              ← Campaigns
            </button>
            <div style="flex:1; display:flex; align-items:center; gap:14px;">
              <span id="wizard-campaign-name" style="font-size:18px; font-weight:900; color:var(--text-main); letter-spacing:-0.03em;"></span>
              <span id="wizard-status-badge" style="font-size:11px; font-weight:800; color:#fff; padding:4px 12px; border-radius:30px;"></span>
            </div>
            
            <button id="wizard-toggle-panel" style="display:flex; align-items:center; gap:8px; padding:9px 18px; border:1.5px solid var(--border-light); border-radius:10px; background:#fff; color:var(--text-muted); cursor:pointer; font-size:12px; font-weight:700; font-family:inherit; transition:all 0.2s; margin-right:8px;"
                    onmouseover="this.style.borderColor='var(--primary)';this.style.color='var(--primary)'"
                    onmouseout="this.style.borderColor='var(--border-light)';this.style.color='var(--text-muted)'">
              ${_sidebarVisible ? 'Hide Panel' : 'Show Panel'}
            </button>

            <span style="font-size:12px; color:var(--text-muted);">Auto-saved</span>
          </div>

          <!-- Step Bar -->
          <div style="background:#fff; border-bottom:1px solid var(--border-light); padding:24px 60px; flex-shrink:0;">
            <div id="wizard-step-bar" style="display:flex; align-items:flex-start; max-width:650px; margin:0 auto;"></div>
          </div>

          <!-- Main Wizard Body -->
          <div style="flex:1; display:flex; overflow:hidden; background:#fff;">
            <!-- Step Content Area -->
            <div id="wizard-content-area" style="flex:1; overflow:hidden; position:relative; display:flex; flex-direction:column;"></div>
            
            <!-- Persistent Sidebar (Worker Assignment) -->
            <!-- Persistent Sidebar (Worker Assignment) -->
            <div id="wizard-sidebar-area" style="width:360px; border-left:1px solid var(--border-light); background:#fff; display:${_sidebarVisible ? 'flex' : 'none'}; flex-direction:column; overflow:hidden;"></div>
          </div>

          <!-- Bottom Nav -->
          <div id="wizard-bottom-nav" style="display:flex; justify-content:space-between; align-items:center; padding:14px 28px; background:#fff; border-top:1px solid var(--border-light); flex-shrink:0;"></div>
        </div>`
        shell = container.querySelector('.wizard-shell')

        // Back to gallery
        shell.querySelector('#wizard-back-to-gallery').addEventListener('click', () => {
            saveCurrentProject()
            _campaignView = 'gallery'
            container.innerHTML = ''
            render()
        })

        shell.querySelector('#wizard-toggle-panel').addEventListener('click', () => {
            _sidebarVisible = !_sidebarVisible
            render()
        })
    }

    // ── Update header ──
    const nameEl = shell.querySelector('#wizard-campaign-name')
    const badgeEl = shell.querySelector('#wizard-status-badge')
    const toggleBtn = shell.querySelector('#wizard-toggle-panel')
    const sidebarArea = shell.querySelector('#wizard-sidebar-area')

    if (nameEl) nameEl.textContent = currentProject?.name || 'Campaign'
    if (badgeEl) {
        badgeEl.textContent = currentProject?.status || 'DRAFT'
        badgeEl.style.background = statusColor
    }

    // Sync sidebar toggle state
    if (toggleBtn) {
        toggleBtn.innerHTML = _sidebarVisible ? 'Hide Panel' : 'Show Panel'
    }
    if (sidebarArea) {
        sidebarArea.style.display = _sidebarVisible ? 'flex' : 'none'
    }

    // ── Update step bar ──
    const stepBar = shell.querySelector('#wizard-step-bar')
    if (stepBar) {
        stepBar.innerHTML = stepBarHtml
        stepBar.querySelectorAll('.wizard-step-dot[data-step]').forEach(dot => {
            dot.addEventListener('click', () => {
                const s = WIZARD_STEPS.find(x => x.id === dot.dataset.step)
                const dotIdx = WIZARD_STEPS.findIndex(x => x.id === dot.dataset.step)
                if (s && dotIdx <= stepIdx) { // only allow going back to completed steps
                    saveCurrentProject()
                    _innerSendTab = s.id
                    render()
                }
            })
        })
    }

    // ── Update content area ──
    const contentArea = shell.querySelector('#wizard-content-area')
    let subHtml = ''
    if (_innerSendTab === 'leads') subHtml = renderStagingArea(readyAccounts)
    if (_innerSendTab === 'messages') subHtml = renderMessageStudio()
    if (_innerSendTab === 'config') subHtml = renderConfiguration()
    if (_innerSendTab === 'launch') subHtml = renderLaunchStep(displayLeads)

    if (contentArea.innerHTML !== subHtml) {
        contentArea.innerHTML = subHtml
        setupSendListeners(contentArea)
    }

    // ── Update sidebar area ──
    // Sidebar area already queried above
    if (sidebarArea && _sidebarVisible) {
        const sidebarHtml = renderPersistentSidebar(displayLeads, readyAccounts)
        if (sidebarArea.innerHTML !== sidebarHtml) {
            sidebarArea.innerHTML = sidebarHtml
            setupSidebarListeners(sidebarArea)
        }
    }

    // ── Update bottom nav ──
    const bottomNav = shell.querySelector('#wizard-bottom-nav')
    if (bottomNav) {
        bottomNav.innerHTML = `${backBtn}${nextBtn}`

        const backBtnEl = bottomNav.querySelector('#wizard-back-btn')
        const nextBtnEl = bottomNav.querySelector('#wizard-next-btn')
        const launchBtnEl = bottomNav.querySelector('#wizard-launch-btn')

        if (backBtnEl) {
            backBtnEl.addEventListener('click', () => {
                saveCurrentProject()
                _innerSendTab = prevStep.id
                render()
            })
        }
        if (nextBtnEl) {
            nextBtnEl.addEventListener('click', () => {
                saveCurrentProject()
                window.handleCampaignWizardNext(nextBtnEl)
            })
        }
        if (launchBtnEl) {
            launchBtnEl.addEventListener('click', () => {
                window.handleCampaignWizardNext(launchBtnEl)
            })
        }

    }

    // ── Banner scope ──
    const banner = document.getElementById('campaign-status-banner')
    if (banner) {
        const shouldBeVisible = (activeTab === 'campaigns') && (_innerSendTab === 'launch') && !_bannerUserForceHidden
        banner.classList.toggle('hidden', !shouldBeVisible)
    }
}

// ── LAUNCH STEP (Step 4) ─────────────────────────────────────────────────────


// ── LEGACY: renderCampaignWorkspace kept as alias for any remaining calls ────
function renderCampaignWorkspace(container) {
    renderCampaignBuilder(container)
}

function setupSendListeners(container) {
    if (_innerSendTab === 'leads') setupStagingListeners(container)
    if (_innerSendTab === 'messages') setupStudioListeners(container)
    if (_innerSendTab === 'config') setupConfigurationListeners(container)
    if (_innerSendTab === 'autoreply') setupAutoReplyListeners(container)
    if (_innerSendTab === 'launch') setupLaunchListeners(container)
}

function setupSidebarListeners(container) {
    const updateHeaderBadge = () => {
        const total = _stagedLeads.length
        let assigned = 0
        let hasError = false
        const assignedIndices = new Set()

        Array.from(accounts.values()).forEach(acc => {
            if (acc.range) {
                const indices = parseMatrix(acc.range, total)
                if (indices) {
                    indices.forEach(idx => {
                        if (assignedIndices.has(idx)) hasError = true
                        assignedIndices.add(idx)
                    })
                    assigned += indices.length
                } else {
                    hasError = true
                }
            }
        })
        const label = container.querySelector('#sidebar-distributed-label')
        if (label) label.textContent = `${assigned} / ${total} LEADS DISTRIBUTED`

        // Sync with Campaign Strategy Page (if active)
        const badge = document.querySelector('#matrix-assigned-badge')
        if (badge) badge.textContent = `${assigned} Assigned`

        const coverageText = document.querySelector('#matrix-coverage-text')
        if (coverageText) coverageText.textContent = `${Math.round((assigned / (total || 1)) * 100)}%`

        const feedback = document.querySelector('#matrix-feedback')
        if (feedback) {
            if (hasError) {
                feedback.innerHTML = '❌ <span style="color:var(--status-error)">PROTOCOL ERROR:</span> Overlapping ranges or invalid format detected in sidebar.'
            } else if (assigned === 0) {
                feedback.innerText = 'Use the Campaign Panel on the left to assign lead ranges to your workers.'
            } else {
                feedback.innerHTML = `✅ <span style="color:var(--status-ready)">PROTOCOL STAGED:</span> ${assigned} leads ready for deployment. Randomized delays and sleep cycles are active.`
            }
        }
    }

    container.querySelectorAll('.range-input').forEach(i => {
        i.addEventListener('input', () => {
            const num = i.dataset.number
            const acc = accounts.get(num)
            if (acc) {
                acc.range = i.value
                updateHeaderBadge()
            }
        })
    })

    container.querySelector('#sidebar-delay-min')?.addEventListener('input', (e) => {
        let val = parseInt(e.target.value) || 0
        _userDelayMin = val
        
        // Dynamic gap adjustment
        if (_userDelayMax < _userDelayMin + 20) {
            _userDelayMax = _userDelayMin + 20
            const maxInput = container.querySelector('#sidebar-delay-max')
            if (maxInput) maxInput.value = _userDelayMax
        }
        saveCurrentProject()
    })

    container.querySelector('#sidebar-delay-min')?.addEventListener('blur', (e) => {
        if (_userDelayMin < 10) {
            _userDelayMin = 10
            e.target.value = 10
            // Re-check gap
            if (_userDelayMax < _userDelayMin + 20) {
                _userDelayMax = _userDelayMin + 20
                const maxInput = container.querySelector('#sidebar-delay-max')
                if (maxInput) maxInput.value = _userDelayMax
            }
            saveCurrentProject()
        }
    })

    container.querySelector('#sidebar-delay-max')?.addEventListener('input', (e) => {
        let val = parseInt(e.target.value) || 0
        _userDelayMax = val
        saveCurrentProject()
    })

    container.querySelector('#sidebar-delay-max')?.addEventListener('blur', (e) => {
        // Enforce at least 20s gap from min
        if (_userDelayMax < _userDelayMin + 20) {
            _userDelayMax = _userDelayMin + 20
            e.target.value = _userDelayMax
            saveCurrentProject()
        }
    })

    container.querySelectorAll('.variant-select-sidebar').forEach(sel => {
        sel.addEventListener('change', () => {
            const num = sel.dataset.number
            const acc = accounts.get(num)
            if (acc) {
                acc.assignedVariant = sel.value
                saveCurrentProject()
            }
        })
    })

    container.querySelectorAll('.worker-ar-toggle').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const num = e.target.dataset.number
            const acc = accounts.get(num)
            if (acc) {
                acc.autoReply = e.target.checked
                // TITAN: Persist into global worker config
                if (!_workerConfig) _workerConfig = {}
                _workerConfig[num] = { ...(_workerConfig[num] || {}), autoReply: e.target.checked }

                if (window.api.updateWorkerConfig) {
                    window.api.updateWorkerConfig({ number: num, config: { autoReply: e.target.checked } })
                }
                saveCurrentProject()
                window.api.configSave({ workerConfig: _workerConfig }) // Persist
                render() // Force UI sync
            }
        })
    })

    // Initial sync
    updateHeaderBadge()
}

function renderPersistentSidebar(leads, accounts) {
    // TITAN: Only show ASSIGNED accounts on Launch Screen
    const visibleAccounts = (_innerSendTab === 'launch')
        ? accounts.filter(a => a.range && a.range.trim().length > 0)
        : accounts;

    const totalLeads = leads.length
    const isLocked = (_innerSendTab !== 'leads')

    let assignedCount = 0
    accounts.forEach(acc => {
        if (acc.range) {
            const indices = parseMatrix(acc.range, totalLeads)
            if (indices) assignedCount += indices.length
        }
    })

    const dMin = _userDelayMin || 0
    const dMax = _userDelayMax || 0

    return `
        <div style="height:100%; display:flex; flex-direction:column;">
            
            <!-- SCROLLABLE CONTENT -->
            <div style="flex:1; overflow-y:auto; padding:24px; padding-bottom:100px;">
                <div style="margin-bottom:24px;">
                    <h3 style="margin:0 0 6px 0; font-size:18px; font-weight:800; color:#1e293b;">Campaign Panel</h3>
                    <p style="font-size:13px; color:#64748b; font-weight:500; margin:0;">Assign lead ranges to accounts</p>
                </div>

                <!-- ACCOUNTS SECTION -->
                <div class="titan-card-pro" style="background:#f8fafc; border:1px solid #e2e8f0; padding:16px; border-radius:12px; margin-bottom:20px;">
                <h4 style="margin:0 0 12px 0; font-size:13px; font-weight:800; color:#1e293b; text-transform:uppercase; letter-spacing:0.03em;">Accounts</h4>
                <div id="sidebar-distribution-list" style="display:flex; flex-direction:column; gap:8px;">
                    ${visibleAccounts.length === 0 ? `
                            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:20px; text-align:center;">
                                <p style="font-size:13px; color:#64748b; margin:0 0 4px 0;">No ready accounts found.</p>
                                <p style="font-size:12px; color:#94a3b8; font-weight:600; margin:0;">Assign numbers to workers</p>
                            </div>
                    ` : visibleAccounts.map(acc => {
        const currentRange = acc.range || ''
        const currentAR = (acc.autoReply !== undefined) ? acc.autoReply : (_workerConfig[acc.number]?.autoReply || false)
        return `
                        <div style="background:#fff; padding:12px; border-radius:10px; border:1px solid #e2e8f0; opacity: 1;">
                            <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
                                <div style="font-weight:700; font-size:13px; color:#1e293b; min-width:100px;">+${acc.number}</div>
                                <input type="text" class="range-input assign-input" data-number="${acc.number}" 
                                        value="${currentRange}" placeholder="e.g. 1-100" ${isLocked ? 'readonly' : ''}
                                        onclick="event.stopPropagation()"
                                        style="flex:1; max-width:120px; padding:6px 10px; border:1.5px solid ${isLocked ? '#f1f5f9' : '#cbd5e1'}; background:${isLocked ? '#fcfdfe' : '#fff'}; color:${isLocked ? '#94a3b8' : '#0f172a'}; border-radius:8px; text-align:right; font-weight:800; font-family:monospace; font-size:12px; outline:none; transition:all 0.15s; cursor:${isLocked ? 'not-allowed' : 'text'};">
                            </div>
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                                <select class="variant-select-sidebar" data-number="${acc.number}" 
                                        style="flex:1; padding:4px 8px; border:1.5px solid #e2e8f0; border-radius:6px; font-size:11px; font-weight:600; color:#475569; outline:none; background-color:#fff;">
                                    <option value="auto" ${acc.assignedVariant == 'auto' ? 'selected' : ''}>Auto Rotator</option>
                                    ${_messageVariants.map((v, i) => `<option value="${i}" ${(acc.assignedVariant == i || (acc.assignedVariant === undefined && i === 0)) ? 'selected' : ''}>Variant ${String.fromCharCode(65 + i)}</option>`).join('')}
                                </select>
                                <div style="display:flex; align-items:center; gap:8px; opacity: 1;">
                                    <span style="font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Bot</span>
                                    <label class="titan-toggle" style="transform: scale(0.7); transform-origin: right;">
                                        <input type="checkbox" class="worker-ar-toggle" data-number="${acc.number}"
                                                ${currentAR ? 'checked' : ''}>
                                        <span class="titan-toggle-slider"></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    `
    }).join('')
        }
                </div>
            </div>

            <!-- SCROLLABLE CONTENT END -->
        </div>

        <div style="padding:16px 24px; background:#fff; border-top:1px solid #e2e8f0; box-shadow:0 -4px 12px rgba(0,0,0,0.03); z-index:10; display:flex; flex-direction:column; gap:12px;">
            <div id="sidebar-distributed-label" style="text-align:center; font-size:11px; font-weight:800; color:#64748b; letter-spacing:0.05em; background:#f1f5f9; padding:6px; border-radius:6px;">
                ${assignedCount} / ${totalLeads} LEADS ASSIGNED
            </div>
        </div>
    </div>`
}




function refreshBannerUI(campaignId) {
    // USER REQUEST: Disable banner entirely
    return;

    const banner = document.getElementById('campaign-status-banner')

    const bannerStatus = document.getElementById('banner-status-text')
    const bannerEta = document.getElementById('banner-eta')
    const bannerFill = document.getElementById('banner-progress-fill')
    const bannerCount = document.getElementById('banner-count')

    const activeCamp = (campaignId && _activeCampaigns.has(campaignId))
        ? _activeCampaigns.get(campaignId)
        : (_viewingCampaignId && _activeCampaigns.has(_viewingCampaignId) ? _activeCampaigns.get(_viewingCampaignId) : null);

    if (!activeCamp) return;

    const leads = activeCamp.leads || []
    const total = leads.length
    const sent = leads.filter(l => l.status === 'SENT').length
    const failed = leads.filter(l => l.status === 'FAILED').length
    const processed = sent + failed
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0

    if (bannerFill) bannerFill.style.width = `${percent}% `
    if (bannerCount) bannerCount.textContent = `${processed} / ${total}`

    if (activeCamp.status === 'COMPLETE' || (total > 0 && processed >= total)) {
        // HIDE BANNER IMMEDIATELY (User Request)
        if (banner) {
            banner.classList.add('hidden')
            banner.classList.remove('completed')
        }

        // TITAN: Auto-Unlock UI on Completion
        // Mark strictly complete to prevent re-locking
        activeCamp.status = 'COMPLETE'

        // If we are currently on the execution screen, re-render to unlock
        const currentBtn = document.getElementById('sidebar-launch-btn')
        if (currentBtn && !currentBtn.disabled && currentBtn.innerText !== 'START CAMPAIGN') {
            // Re-render to show completion state and "New Campaign" button
            render()
        }
    } else {
        if (activeCamp.waitState?.active && activeCamp.waitState?.seconds > 0) {
            if (bannerStatus) bannerStatus.textContent = `⏳ RANDOM DELAY: ${activeCamp.waitState.seconds}s`
        } else {
            if (bannerStatus) bannerStatus.textContent = `🚀 Active`
        }

        const remaining = total - processed;
        if (remaining > 0) {
            const safetyDelay = (activeCamp.delayMax || _userDelayMax || 120);
            const remainingMs = remaining * (safetyDelay + 2) * 1000;
            const min = Math.floor(remainingMs / 60000);
            const sec = Math.floor((remainingMs % 60000) / 1000);
            if (bannerEta) bannerEta.textContent = `Est. Time: ${min}m ${sec}s`;
        } else {
            if (bannerEta) bannerEta.textContent = 'Est. Time: Finishing...';
        }
    }

    const shouldBeVisible = (activeTab === 'campaigns') && (_innerSendTab === 'launch') && !_bannerUserForceHidden;
    if (shouldBeVisible) {
        banner.classList.remove('hidden')
    } else {
        banner.classList.add('hidden')
    }

    const sideBarProg = document.getElementById('sidebar-progress-text')
    const sideBarBar = document.getElementById('sidebar-progress-bar')
    if (sideBarProg) sideBarProg.textContent = `${processed} / ${total}`
    if (sideBarBar) sideBarBar.style.width = `${percent}%`
}

function renderStagingArea(accounts) {
    const total = _stagedLeads.length
    const currentProject = _campaignProjects.find(c => c.id === _currentCampaignId)
    const status = currentProject?.status || 'DRAFT'

    return `
    <div class="titan-canvas" style="background:#f8fafc; padding: 0;">
        <div class="titan-container" style="padding: 32px; height:100%; display:flex; flex-direction:column; gap:8px;">
            
            <!-- STATUS BADGE -->
            <div>
                <span style="background:#f59e0b; color:#fff; font-size:11px; font-weight:800; padding:4px 12px; border-radius:6px; letter-spacing:0.02em;">${status}</span>
            </div>

            <!-- PRO HEADER BAR -->
            <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                <div>
                    <h2 style="margin:0 0 4px 0; font-size:28px; font-weight:800; color:#1e293b; letter-spacing:-0.03em;">Contacts</h2>
                    <p style="margin:0; font-size:14px; color:#64748b; font-weight:500;">Add, edit, or import contacts for this campaign.</p>
                </div>
                <div style="display:flex; gap:12px;">
                    <button id="bulk-paste-btn" class="titan-btn" style="padding:8px 18px; font-size:13px; font-weight:700; background:#f1f5f9; border:1px solid #e2e8f0; color:#475569; border-radius:10px; display:flex; align-items:center;">
                        Bulk Paste
                    </button>
                    <button id="clear-staged-btn" class="titan-btn" style="padding:8px 18px; font-size:13px; font-weight:700; background:#f1f5f9; border:1px solid #fee2e2; color:#ef4444; border-radius:10px; display:flex; align-items:center;">
                        Clear All
                    </button>
                    <button id="import-excel-btn" class="titan-btn" style="padding:8px 18px; font-size:13px; font-weight:700; background:#f1f5f9; border:1px solid #e2e8f0; color:#475569; border-radius:10px; display:flex; align-items:center; gap:8px;">
                        Import Excel File
                    </button>
                </div>
            </div>

            <!-- QUICK ADD AREA -->
            <div class="titan-card-pro" style="padding:28px; background:#fff; border-radius:16px; border:1px solid #e2e8f0; display:flex; align-items:flex-end; gap:20px; box-shadow: 0 4px 20px rgba(0,0,0,0.02);">
                <div style="flex:1.2;">
                    <label style="display:block; font-size:11px; font-weight:800; color:#64748b; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.05em;">Lead Name</label>
                    <input type="text" id="manual-lead-name" class="matrix-input" style="height:52px; background:#f8fafc; border-radius:10px;" placeholder="e.g. John Doe" value="${_manualLeadState.name}">
                </div>
                <div style="flex:1.5;">
                    <label style="display:block; font-size:11px; font-weight:800; color:#64748b; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.05em;">Whatsapp Number (Full ID)</label>
                    <input type="tel" id="manual-lead-phone" class="matrix-input" style="height:52px; background:#f8fafc; border-radius:10px;" placeholder="e.g. 918882616461" value="${_manualLeadState.phone}" maxlength="12">
                </div>
                <button id="add-manual-btn" class="titan-btn-primary" style="height:52px; padding:0 36px; font-size:14px; font-weight:800; border-radius:12px; display:flex; align-items:center; gap:10px; background:#2563eb;">
                    <span style="font-size:22px; position:relative; top:-1px;">+</span> ADD NUMBER
                </button>
            </div>

            <!-- TABLE CONTENT -->
            <div class="titan-card-pro" style="flex:1; display:flex; flex-direction:column; background:#fff; border-radius:16px; border:1px solid #e2e8f0; overflow:hidden;">
                <div style="flex:1; overflow-y:auto;">
                    <table class="titan-table">
                        <thead>
                            <tr style="background:#f8fafc;">
                                <th style="width:70px; color:#64748b; font-weight:800; font-size:11px; text-transform:uppercase;">ID</th>
                                <th style="color:#64748b; font-weight:800; font-size:11px; text-transform:uppercase;">Lead Name</th>
                                <th style="color:#64748b; font-weight:800; font-size:11px; text-transform:uppercase;">Whatsapp Number</th>
                                <th style="color:#64748b; font-weight:800; font-size:11px; text-transform:uppercase;">Source / Origin</th>
                                <th style="text-align:right; width:90px; color:#64748b; font-weight:800; font-size:11px; text-transform:uppercase;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${total === 0 ? `
                                <tr>
                                    <td colspan="5" style="text-align:center; padding:120px 40px; color:#94a3b8;">
                                        <div style="font-size:54px; margin-bottom:16px; opacity:0.5;">👥</div>
                                        <div style="font-weight:700; font-size:18px; color:#475569;">Your contact list is empty</div>
                                        <div style="font-size:14px; margin-top:8px;">Add a number manually or import an Excel file to see them here.</div>
                                    </td>
                                </tr>
                            ` : (_stagedLeads.slice(0, 100).map((l, i) => {
        const sourceLabel = (l.groupSource || 'Manual Entry').toUpperCase()
        return `
                                <tr style="border-bottom: 1px solid #f1f5f9;">
                                    <td style="font-weight:800; color:#1e293b; padding:22px 24px;">${i + 1}</td>
                                    <td style="font-weight:700; color:#1e293b; padding:22px 24px;">${l.name || '<span style="opacity:0.3; font-weight:400;">—</span>'}</td>
                                    <td style="color:#2563eb; font-weight:700; font-family:'JetBrains Mono', monospace; padding:22px 24px;">+${l.phone}</td>
                                    <td style="padding:22px 24px;">
                                        <span style="background:#f1f5f9; color:#64748b; font-size:10px; font-weight:800; padding:6px 12px; border-radius:8px; border:1px solid #e2e8f0; display:inline-block; letter-spacing:0.02em;">${sourceLabel}</span>
                                    </td>
                                    <td style="text-align:right; padding:22px 24px;">
                                        <button class="remove-lead-btn" data-index="${i}" style="width:36px; height:36px; background:#fef2f2; border:1px solid #fee2e2; border-radius:10px; color:#ef4444; font-size:20px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'">×</button>
                                    </td>
                                </tr>
                                `
    }).join('') + (_stagedLeads.length > 100 ? `
                                <tr>
                                    <td colspan="5" style="text-align:center; padding:16px; background:#f8fafc; color:#64748b; font-size:12px; font-weight:600; border-top:1px solid #e2e8f0;">
                                        Showing top 100 of ${total} contacts. All contacts will be included in the campaign.
                                    </td>
                                </tr>
    `: ''))}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- BULK PASTE OVERLAY -->
            ${_manualLeadState.showBulk ? `
            <div style="position:absolute; inset:0; background:rgba(15,23,42,0.6); backdrop-filter:blur(4px); z-index:100; display:flex; align-items:center; justify-content:center; padding:40px;">
                <div class="titan-card-pro animate-slide-up" style="width:100%; max-width:600px; box-shadow:0 32px 64px rgba(0,0,0,0.2); border-radius:20px;">
                    <div style="padding:24px 32px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; background:#fff;">
                        <h3 style="margin:0; font-size:20px; font-weight:800; color:#1e293b;">Bulk Import Contacts</h3>
                        <button id="cancel-paste-btn" class="titan-btn-ghost" style="padding:8px; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; font-size:24px; color:#94a3b8;">×</button>
                    </div>
                    <div style="padding:32px; background:#fff;">
                        <textarea id="bulk-paste-input" class="matrix-input" style="height:320px; resize:none; background:#f8fafc; padding:20px; font-family:monospace; font-size:14px; border-radius:12px;" placeholder="Name, Phone (New line separated)&#10;Example:&#10;John Doe, 919999999999&#10;918888888888">${_manualLeadState.bulk}</textarea>
                        <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:28px;">
                            <button id="process-paste-btn" class="titan-btn-primary" style="padding:16px 36px; font-weight:800; border-radius:12px;">Confirm & Import Contacts</button>
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}

        </div>
    </div>`
}


function setupStagingListeners(container) {
    container.querySelectorAll('.remove-lead-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _stagedLeads.splice(parseInt(btn.dataset.index), 1)
            render()
        })
    })

    container.querySelector('#clear-staged-btn')?.addEventListener('click', async () => {
        if (await titanConfirm('Clear Staging', "Are you sure you want to clear all staged leads?")) {
            _stagedLeads = [];
            saveCurrentProject();
            render();
        }
    })

    // Inputs
    container.querySelector('#manual-lead-name')?.addEventListener('input', (e) => { _manualLeadState.name = e.target.value })
    container.querySelector('#manual-lead-phone')?.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '')
        e.target.value = val.slice(0, 12)
        _manualLeadState.phone = e.target.value
    })
    container.querySelector('#manual-lead-phone')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') container.querySelector('#add-manual-btn')?.click()
    })

    container.querySelector('#add-manual-btn')?.addEventListener('click', () => {
        const phone = _manualLeadState.phone.replace(/\D/g, '')
        const errorEl = container.querySelector('#manual-entry-error')
        if (phone.length !== 12) {
            titanAlert('Invalid Number', "Please enter exactly 12 digits (Country Code + Number).")
            return
        }
        _stagedLeads.unshift({ name: _manualLeadState.name.trim(), phone, groupSource: 'Manual Entry' })
        _manualLeadState.name = ''; _manualLeadState.phone = ''
        saveCurrentProject()
        render()
    })

    container.querySelector('#bulk-paste-btn')?.addEventListener('click', () => { _manualLeadState.showBulk = true; render() })
    container.querySelector('#cancel-paste-btn')?.addEventListener('click', () => { _manualLeadState.showBulk = false; render() })
    container.querySelector('#process-paste-btn')?.addEventListener('click', () => {
        const input = container.querySelector('#bulk-paste-input').value
        if (!input.trim()) return
        const lines = input.split('\n')
        const newLeads = []
        lines.forEach(line => {
            const parts = line.split(/[,\t|;]/)
            let phone = '', name = ''
            if (parts.length >= 2) {
                const p1 = parts[0].replace(/\D/g, ''), p2 = parts[1].replace(/\D/g, '')
                if (p2.length > p1.length && p2.length >= 8) { phone = p2; name = parts[0].trim() }
                else if (p1.length >= 8) { phone = p1; name = parts[1].trim() }
            } else { phone = line.replace(/\D/g, '') }
            if (phone.length >= 8) newLeads.push({ name: name || '', phone, groupSource: 'Bulk Paste' })
        })
        if (newLeads.length > 0) {
            _stagedLeads = [...newLeads, ..._stagedLeads]
            _manualLeadState.bulk = ''; _manualLeadState.showBulk = false
            saveCurrentProject()
            render()
        }
    })

    container.querySelector('#import-excel-btn')?.addEventListener('click', async () => {
        try {
            const leads = await window.api.importCampaignLeads()
            if (leads && leads.length > 0) {
                _stagedLeads = [..._stagedLeads, ...leads]
                saveCurrentProject()
                render()
            }
        } catch (err) { titanAlert('Import Error', 'Failed to load Excel file.') }
    })
}

function renderConfiguration() {
    const totalLeads = _stagedLeads.length
    const readyAccounts = Array.from(accounts.values()).filter(a =>
        a.state === STATES.LOGGED_IN || a.state === STATES.GROUPS_READY || a.state === STATES.EXTRACTION_DONE)

    let assignedCount = 0
    readyAccounts.forEach(acc => {
        if (acc.range) {
            const indices = parseMatrix(acc.range, totalLeads)
            if (indices) assignedCount += indices.length
        }
    })

    return `
    <div class="titan-canvas">
        <div class="titan-container" style="padding: 32px; height:100%; display:flex; flex-direction:column; gap:24px;">

            <!-- PRO HEADER BAR -->
            <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                <div>
                    <h2 style="margin:0 0 4px 0; font-size:24px; font-weight:800; color:var(--text-main); letter-spacing:-0.03em;">Campaign Strategy</h2>
                    <p style="color:var(--text-muted); margin:0; font-size:13px; font-weight:500;">Define safety protocols and automated behavior.</p>
                </div>
                <div style="display:flex; gap:12px;">
                    <span class="titan-badge-pill titan-badge-gray">${totalLeads.toLocaleString()} Total Leads</span>
                    <span class="titan-badge-pill titan-badge-blue" id="matrix-assigned-badge">${assignedCount.toLocaleString()} Assigned</span>
                </div>
            </div>

            <div style="display:flex; justify-content:center;">
                <!-- SAFETY PROTOCOLS CARD -->
                <div class="titan-card-pro" style="width:100%; max-width:600px; padding:32px; background:#fff; border:1px solid #e2e8f0; border-radius:24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                    <div style="font-size:16px; font-weight:800; color:var(--text-main); margin-bottom:24px; display:flex; align-items:center; gap:10px;">
                        <span style="font-size:20px;">🛡️</span> Safety Delays
                    </div>
                    <div style="display:flex; gap:20px; align-items:center; margin-bottom:32px;">
                        <div style="flex:1;">
                            <label style="display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Min Delay (Sec)</label>
                            <input type="number" id="matrix-delay-min" class="matrix-input" value="${Math.max(10, _userDelayMin)}" min="10" style="width:100%; padding:12px; border-radius:12px;">
                        </div>
                        <div style="flex:1;">
                            <label style="display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Max Delay (Sec)</label>
                            <input type="number" id="matrix-delay-max" class="matrix-input" value="${Math.max(_userDelayMin + 10, _userDelayMax)}" min="20" style="width:100%; padding:12px; border-radius:12px;">
                        </div>
                    </div>

                    <div style="font-size:16px; font-weight:800; color:var(--text-main); margin-bottom:24px; display:flex; align-items:center; gap:10px;">
                        <span style="font-size:20px;">🌙</span> Sleep Mode (Anti-Ban)
                    </div>
                    <div style="display:flex; gap:20px; align-items:center;">
                        <div style="flex:1;">
                            <label style="display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Messages Before Sleep</label>
                            <input type="number" id="matrix-sleep-threshold" class="matrix-input" value="${_userSleepThreshold}" min="1" style="width:100%; padding:12px; border-radius:12px;">
                        </div>
                        <div style="flex:1;">
                            <label style="display:block; font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Sleep Duration (Min)</label>
                            <input type="number" id="matrix-sleep-duration" class="matrix-input" value="${_userSleepDuration}" min="1" style="width:100%; padding:12px; border-radius:12px;">
                        </div>
                    </div>
                    
                    <div style="margin-top:24px; padding:16px; background:#f8fafc; border-radius:12px; border:1px solid #f1f5f9; display:flex; gap:12px; align-items:center;">
                        <div style="font-size:18px;">💡</div>
                        <div style="font-size:12px; color:#64748b; font-weight:600; line-height:1.5;">
                            Random delays and frequent sleep breaks are automatically applied to mimic human behavior and keep your accounts safe.
                        </div>
                    </div>
                </div>
            </div>

        </div>
    </div > `
}

function setupConfigurationListeners(container) {
    const feedback = container.querySelector('#matrix-feedback')
    const badge = container.querySelector('#matrix-assigned-badge')
    const coverageText = container.querySelector('#matrix-coverage-text')

    const updateStrategySummary = () => {
        const total = _stagedLeads.length
        let assignedCount = 0
        let hasError = false
        let assignedIndices = new Set()

        // Scan all accounts for ranges (even if range-input is in sidebar)
        const readyAccounts = Array.from(accounts.values()).filter(a =>
            a.state === STATES.LOGGED_IN || a.state === STATES.GROUPS_READY || a.state === STATES.EXTRACTION_DONE)

        readyAccounts.forEach(acc => {
            if (acc.range) {
                const indices = parseMatrix(acc.range, total)
                if (!indices) { hasError = true; return }
                indices.forEach(idx => {
                    if (assignedIndices.has(idx)) hasError = true
                    assignedIndices.add(idx)
                })
                assignedCount += indices.length
            }
        })

        if (badge) badge.innerText = `${assignedCount.toLocaleString()} Assigned`
        if (coverageText) coverageText.innerText = `${Math.round((assignedCount / (total || 1)) * 100)}%`

        if (hasError) {
            if (feedback) feedback.innerHTML = '❌ <span style="color:var(--status-error)">PROTOCOL ERROR:</span> Overlapping ranges or invalid format detected in sidebar.'
        } else if (assignedCount === 0) {
            if (feedback) feedback.innerText = 'Use the Campaign Panel on the left to assign lead ranges to your workers.'
        } else {
            if (feedback) {
                feedback.innerHTML = `✅ <span style="color:var(--status-ready)">PROTOCOL STAGED:</span> ${assignedCount} leads ready for deployment. Randomized delays and sleep cycles are active.`
            }
        }
    }

    // DELAY INPUTS
    container.querySelector('#matrix-delay-min')?.addEventListener('input', (e) => {
        let val = parseInt(e.target.value) || 0
        _userDelayMin = val
        
        // Dynamic gap adjustment
        if (_userDelayMax < _userDelayMin + 20) {
            _userDelayMax = _userDelayMin + 20
            const maxInput = container.querySelector('#matrix-delay-max')
            if (maxInput) maxInput.value = _userDelayMax
        }
        saveCurrentProject()
    })
    
    container.querySelector('#matrix-delay-min')?.addEventListener('blur', (e) => {
        if (_userDelayMin < 10) {
            _userDelayMin = 10
            e.target.value = 10
            // Re-check gap
            if (_userDelayMax < _userDelayMin + 20) {
                _userDelayMax = _userDelayMin + 20
                const maxInput = container.querySelector('#matrix-delay-max')
                if (maxInput) maxInput.value = _userDelayMax
            }
            saveCurrentProject()
        }
    })

    container.querySelector('#matrix-delay-max')?.addEventListener('input', (e) => {
        let val = parseInt(e.target.value) || 0
        _userDelayMax = val
        saveCurrentProject()
    })

    container.querySelector('#matrix-delay-max')?.addEventListener('blur', (e) => {
        // Enforce at least 20s gap from min
        if (_userDelayMax < _userDelayMin + 20) {
            _userDelayMax = _userDelayMin + 20
            e.target.value = _userDelayMax
            saveCurrentProject()
        }
    })

    // SLEEP MODE INPUTS
    container.querySelector('#matrix-sleep-threshold')?.addEventListener('input', (e) => {
        _userSleepThreshold = parseInt(e.target.value) || 0
        saveCurrentProject()
    })
    container.querySelector('#matrix-sleep-threshold')?.addEventListener('blur', (e) => {
        if (_userSleepThreshold < 1) {
            _userSleepThreshold = 1
            e.target.value = 1
            saveCurrentProject()
        }
    })

    container.querySelector('#matrix-sleep-duration')?.addEventListener('input', (e) => {
        _userSleepDuration = parseInt(e.target.value) || 0
        saveCurrentProject()
    })
    container.querySelector('#matrix-sleep-duration')?.addEventListener('blur', (e) => {
        if (_userSleepDuration < 1) {
            _userSleepDuration = 1
            e.target.value = 1
            saveCurrentProject()
        }
    })

    // Listen for range changes in sidebar (via global poll or event)
    // For now we can just poll summary or rely on user clicking next
    updateStrategySummary()
}




function setupLaunchListeners(container) {
    container.querySelector('#wizard-launch-btn')?.addEventListener('click', (e) => {
        window.handleCampaignWizardNext(e.target)
    })

    // Global listeners for campaign controls are handled via event delegation in app.js
    // but we can add specific local ones if needed.
}




function renderMessageStudio() {
    const activeIndex = window._activeVariantIdx || 0
    const attachedName = _attachedMediaName || ''

    return `
    <div class="titan-canvas" style="overflow-y:auto; height:100%;">
        <div class="titan-container" style="padding-top:32px; padding-bottom:100px; min-height:100%;">

            <!-- GRID: Editor (Left) | Phone (Center) -->
            <div style="display:grid; grid-template-columns: 1fr 340px; gap:40px; align-items:start;">

                <!-- LEFT COLUMN: EDITOR -->
                <div style="display:flex; flex-direction:column; gap:24px;">

                    <!-- PRO EDITOR COMPONENT -->
                    <div style="background:#fff; border-radius:12px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.05); border:1px solid #e2e8f0; overflow:hidden;">

                        <!-- TOOLBAR HEADER -->
                        <div style="padding:20px 24px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:32px;">
                                <div style="display:flex; align-items:center; gap:10px; color:#334155;">
                                    <span style="font-size:18px;">📝</span>
                                    <span style="font-weight:800; font-size:14px; letter-spacing:-0.01em;">Message Studio</span>
                                </div>
                                <div style="height:24px; width:1px; background:#cbd5e1;"></div>

                                <div style="display:flex; align-items:center; gap:12px;">
                                    <label style="font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">ACTIVE VARIANT:</label>
                                    <select id="variant-select" style="padding:8px 16px; border:1px solid #cbd5e1; border-radius:10px; font-size:13px; font-weight:700; color:#334155; outline:none; background:#fff; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05); min-width:140px;">
                                        ${_messageVariants.map((v, i) => `<option value="${i}" ${i === activeIndex ? 'selected' : ''}>Variant ${String.fromCharCode(65 + i)}</option>`).join('')}
                                    </select>
                                </div>
                            </div>

                            <div style="display:flex; gap:12px;">
                                <button id="add-variant-btn" class="titan-btn-ghost" style="font-size:12px; font-weight:800; color:#fff; padding:10px 20px; background:#3b82f6; border-radius:10px; border:none; box-shadow:0 2px 4px rgba(59,130,246,0.25);">+ New Variant</button>
                                ${_messageVariants.length > 1 ? `<button id="delete-variant-btn" style="padding:10px 14px; color:#ef4444; background:#fff; border:1px solid #fee2e2; border-radius:10px; cursor:pointer; font-size:13px; box-shadow:0 1px 2px rgba(0,0,0,0.05);" title="Delete Variant">🗑</button>` : ''}
                            </div>
                        </div>

                        <!-- EDITOR BODY -->
                        <div id="variant-stack" style="background:#fff;">
                            ${_messageVariants.map((v, i) => `
                                <div id="variant-group-${i}" style="display:${i === activeIndex ? 'block' : 'none'};">
                                    <textarea id="variant-editor-${i}" class="variant-editor" data-index="${i}" 
                                        placeholder="Hi {name}, type your message here..."
                                        style="display:block; width:100%; border:none; padding:20px; height:240px; resize:none; outline:none; font-family:'Inter', sans-serif; font-size:14px; line-height:1.6; color:#1e293b;">${v}</textarea>
                                    
                                    <!-- FOOTER TOOLBAR -->
                                    <div style="padding:20px 28px; border-top:1px solid #f1f5f9; background:#fff; display:flex; justify-content:space-between; align-items:center;">
                                        
                                        <!-- LEFT: Formatting -->
                                        <div style="display:flex; gap:12px;">
                                            <button class="fmt-btn" data-fmt="bold" data-index="${i}" title="Bold" style="width:38px; height:38px; border-radius:10px; font-weight:800; border:1px solid #e2e8f0; background:#f8fafc; cursor:pointer; color:#475569; transition:all 0.2s;">B</button>
                                            <button class="fmt-btn" data-fmt="italic" data-index="${i}" title="Italic" style="width:38px; height:38px; border-radius:10px; font-weight:700; font-family:serif; font-style:italic; border:1px solid #e2e8f0; background:#f8fafc; cursor:pointer; color:#475569; transition:all 0.2s;">I</button>
                                            <button class="fmt-btn" data-fmt="strike" data-index="${i}" title="Strike" style="width:38px; height:38px; border-radius:10px; font-weight:700; text-decoration:line-through; border:1px solid #e2e8f0; background:#f8fafc; cursor:pointer; color:#475569; transition:all 0.2s;">S</button>
                                        </div>

                                        <!-- RIGHT: Variables + Count -->
                                        <div style="display:flex; align-items:center; gap:32px;">
                                            <div id="char-count-${i}" style="font-size:12px; font-weight:700; color:#94a3b8; font-variant-numeric:tabular-nums; letter-spacing:0.02em;">${v.length} CHARACTERS</div>
                                            <button class="insert-var-btn" data-index="${i}" style="background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; padding:10px 24px; border-radius:12px; font-size:12px; font-weight:800; cursor:pointer; transition:all 0.2s; box-shadow:0 1px 2px rgba(22,163,74,0.1);">
                                                + Insert {name}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                `).join('')}
                        </div>
                    </div>

                    <!-- ATTACHMENTS -->
                    <div class="titan-card">
                        <div class="titan-title-md" style="margin-bottom:16px;">Media Attachment</div>
                        <div id="media-drop-zone" style="border:2px dashed ${_attachedMediaName ? 'var(--primary)' : '#cbd5e1'}; background:${_attachedMediaName ? '#f0fdf4' : '#f8fafc'}; border-radius:12px; padding:24px; text-align:center; transition:all 0.2s; cursor:pointer; position:relative;">
                            <input type="file" id="media-file-input" style="display:none;" accept="image/*,video/*,application/pdf">

                                <div style="display:flex; align-items:center; justify-content:center; gap:20px;">
                                    <div style="width:54px; height:54px; border-radius:14px; background:${_attachedMediaName ? '#dcfce7' : '#e2e8f0'}; display:flex; align-items:center; justify-content:center; font-size:26px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                                        ${!_attachedMediaName ? '📎' : '🖼️'}
                                    </div>
                                    <div style="text-align:left; flex:1;">
                                        <div style="font-size:14px; font-weight:800; color:var(--text-main); margin-bottom:4px;">${attachedName || 'No media attached'}</div>
                                        <div style="font-size:12px; color:var(--text-muted); font-weight:500;">
                                            ${_attachedMediaName ? 'Ready to send' : 'Drag & drop or click to upload'}
                                        </div>
                                    </div>
                                    ${_attachedMediaName ?
            `<button id="remove-media-btn" style="background:#fff; border:1px solid #fee2e2; color:#ef4444; border-radius:10px; padding:10px 16px; cursor:pointer; font-size:12px; font-weight:800; transition:all 0.2s;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='#fff'">Remove</button>`
            : ''}
                                </div>
                        </div>

                        ${(_attachedMediaName || true) ? `
                        <div style="margin-top:20px; background:#f8fafc; padding:16px; border-radius:10px; border:1px solid #e2e8f0;">
                             <div style="font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; margin-bottom:10px;">Sending Mode</div>
                             <select id="media-mode-select" ${!_attachedMediaName ? 'disabled' : ''} style="width:100%; padding:10px; border-radius:8px; border:1px solid #e2e8f0; font-size:13px; font-weight:600; color:#334155; cursor:${_attachedMediaName ? 'pointer' : 'not-allowed'}; background:${_attachedMediaName ? '#fff' : '#f1f5f9'};">
                                 <option value="text_only" ${_mediaSendMode === 'text_only' ? 'selected' : ''}>Default (Text Only)</option>
                                 <option value="combined" ${_mediaSendMode === 'combined' ? 'selected' : ''}>Combined (Media + Caption)</option>
                                 <option value="text_first" ${_mediaSendMode === 'text_first' ? 'selected' : ''}>Text first, then Media</option>
                                 <option value="media_first" ${_mediaSendMode === 'media_first' ? 'selected' : ''}>Media first, then Text</option>
                             </select>
                             <div style="margin-top:8px; font-size:11px; color:var(--text-muted); font-style:italic;">Note: Sequential modes send two separate messages.</div>
                        </div>
                        ` : ''}
                    </div>

                </div>

                <!-- RIGHT COLUMN: PHONE MOCKUP (CENTER) -->
                <div style="display:flex; flex-direction:column; align-items:center; position:sticky; top:20px;">
                    <div style="margin-bottom:16px; font-size:12px; font-weight:800; color:#94a3b8; letter-spacing:0.05em; text-transform:uppercase;">Live Preview</div>

                    <div class="phone-mockup" style="transform:scale(0.85); transform-origin:top center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); border:12px solid #1e293b; border-radius:48px; overflow:hidden; background:#fff; width:380px; height:760px; position:relative;">
                        <!-- Speaker Grill -->
                        <div style="position:absolute; top:0; left:50%; transform:translateX(-50%); width:160px; height:32px; background:#1e293b; border-bottom-left-radius:24px; border-bottom-right-radius:24px; z-index:20;"></div>

                        <div class="phone-screen" style="height:100%; display:flex; flex-direction:column; background:#efeae2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                            <!-- WA Header -->
                            <div style="background:#008069; color:#fff; padding:12px 16px; padding-top:40px; display:flex; align-items:center; gap:12px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                                <div style="font-size:20px;">←</div>
                                <div style="width:36px; height:36px; background:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#008069; font-weight:700; font-size:12px;">JD</div>
                                <div>
                                    <div style="font-weight:700; font-size:15px; line-height:1.2;">John Doe</div>
                                    <div style="font-size:11px; opacity:0.9;">online</div>
                                </div>
                                <div style="margin-left:auto; display:flex; gap:16px; font-size:18px;">
                                    <span>📹</span><span>📞</span><span>⋮</span>
                                </div>
                            </div>

                            <!-- Chat Body -->
                            <div class="phone-chat-body" style="flex:1; padding:16px; overflow-y:auto; background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png'); background-attachment: local;">
                                <!-- Previous Dummy Messages -->
                                <div style="background:#fff; border-radius:8px; border-top-left-radius:0; padding:8px 12px; box-shadow:0 1px 1px rgba(0,0,0,0.1); max-width:85%; margin-bottom:12px; font-size:13px; position:relative;">
                                    Hey John! Are you interested in our new services?
                                    <div style="text-align:right; font-size:10px; color:rgba(0,0,0,0.45); margin-top:4px;">10:30 AM</div>
                                </div>
                                <div style="background:#dcf8c6; border-radius:8px; border-top-right-radius:0; padding:8px 12px; box-shadow:0 1px 1px rgba(0,0,0,0.1); max-width:85%; margin-left:auto; margin-bottom:12px; font-size:13px; position:relative;">
                                    Sure, tell me more about it.
                                    <div style="text-align:right; font-size:10px; color:rgba(0,0,0,0.45); margin-top:4px;">10:32 AM <span style="color:#53bdeb;">✓✓</span></div>
                                </div>

                                <div style="display:flex; justify-content:center; margin-bottom:16px;">
                                    <span style="background:rgba(220,248,198,0.8); color:#555; padding:4px 12px; border-radius:8px; font-size:11px; font-weight:600; box-shadow:0 1px 1px rgba(0,0,0,0.1);">Today</span>
                                </div>

                                <!-- Message Bubble -->
                                <div id="live-preview-bubble" style="background:#fff; border-radius:10px; border-top-left-radius:0; padding:8px 10px; padding-bottom:28px; box-shadow:0 1px 2px rgba(0,0,0,0.15); max-width:90%; position:relative; animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                                    ${_attachedMedia ? `
                                        <div style="width:100%; height:160px; background:#f0f2f5; border-radius:6px; margin-bottom:4px; display:flex; align-items:center; justify-content:center; color:#94a3b8; font-size:12px; font-weight:600; overflow:hidden;">
                                            ${attachedName.match(/\.(jpg|jpeg|png|gif)$/i) ? '<img src="" alt="Preview" style="width:100%; height:100%; object-fit:cover; opacity:0.5;">' : '📄 ' + (attachedName || 'Media')}
                                        </div>
                                    ` : ''}
                                    <div style="padding:2px 4px; font-size:16px; color:#111b21; line-height:1.42; -webkit-font-smoothing: antialiased;">
                                        <div id="live-preview-text" style="white-space:pre-wrap; word-wrap:break-word;">${formatPreviewText(_messageVariants[activeIndex] || '')}</div>
                                    </div>
                                    <div style="position:absolute; bottom:4px; right:8px; font-size:10px; color:rgba(0,0,0,0.45);">10:42 AM <span style="color:#53bdeb;">✓✓</span></div>
                                </div>
                            </div>

                            <!-- Input Bar (Fake) -->
                            <div style="padding:8px 10px; background:#f0f2f5; display:flex; align-items:center; gap:8px;">
                                <span style="font-size:20px; color:#54656f;">😊</span>
                                <span style="font-size:20px; color:#54656f;">＋</span>
                                <div style="flex:1; height:36px; background:#fff; border-radius:18px; padding:0 12px; display:flex; align-items:center; color:#cecdcd; font-size:14px;">Type a message</div>
                                <span style="font-size:20px; color:#54656f;">🎤</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </div > `
}

// Helper to format text for preview (bold, etc)
function formatPreviewText(text) {
    if (!text) return '<span style="color:#ccc;">Start typing...</span>'

    // First escape HTML to prevent XSS (basic)
    // Then apply WhatsApp formatting
    // WhatsApp STRICT: Markers must be touching non-whitespace characters
    let formatted = text
        .replace(/\*(\S(?:[^\n\*]*?\S)?)\*/g, '<b>$1</b>')
        .replace(/_(\S(?:[^\n_]*?\S)?)\_/g, '<i>$1</i>')
        .replace(/~(\S(?:[^\n~]*?\S)?)~/g, '<strike>$1</strike>')
        .replace(/\{name\}/g, '<span style="background:#e0f2fe; color:#0284c7; padding:0 4px; border-radius:4px; font-weight:600;">John</span>')

    return formatted
}

function setupStudioListeners(container) {

    // --- VARIANT DROPDOWN ---
    const selector = container.querySelector('#variant-select')
    const stack = container.querySelector('#variant-stack')

    if (selector && stack) {
        selector.addEventListener('change', (e) => {
            const idx = parseInt(e.target.value)
            window._activeVariantIdx = idx

            // Toggle visibility
            stack.querySelectorAll('[id^="variant-group-"]').forEach((el, i) => {
                el.style.display = (i === idx) ? 'block' : 'none'
            })

            // Update preview immediately
            const text = _messageVariants[idx] || ''
            const preview = container.querySelector('#live-preview-text')
            if (preview) preview.innerHTML = formatPreviewText(text)
        })
    }

    // --- SMART FORMATTING BUTTONS ---
    function updateFormatButtons(idx) {
        const textarea = container.querySelector(`#variant-editor-${idx}`)
        if (!textarea) return

        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const text = textarea.value

        const formats = { bold: '*', italic: '_', strike: '~' }
        container.querySelectorAll(`.fmt-btn[data-index="${idx}"]`).forEach(btn => {
            const fmt = btn.dataset.fmt
            const char = formats[fmt]
            let isActive = false

            // Check if selection is wrapped
            if (start > 0 && end < text.length && text[start - 1] === char && text[end] === char) {
                isActive = true
            } else if (text.substring(start, end).startsWith(char) && text.substring(start, end).endsWith(char)) {
                isActive = true
            }

            btn.style.background = isActive ? '#2563eb' : '#f8fafc'
            btn.style.color = isActive ? '#fff' : '#475569'
            btn.style.borderColor = isActive ? '#2563eb' : '#e2e8f0'
        })
    }

    container.querySelectorAll('.fmt-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const fmt = btn.dataset.fmt
            const index = btn.dataset.index
            const textarea = container.querySelector(`#variant-editor-${index}`)
            if (!textarea) return

            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const text = textarea.value
            const selected = text.substring(start, end)

            const formats = { bold: '*', italic: '_', strike: '~' }
            const char = formats[fmt]
            if (!char) return

            let newValue = text
            let newStart = start
            let newEnd = end

            // DETECT IF ALREADY WRAPPED
            const isWrappedInside = (start >= char.length && end <= text.length - char.length && text.substring(start - char.length, start) === char && text.substring(end, end + char.length) === char)
            const isWrappedSelection = (selected.startsWith(char) && selected.endsWith(char) && selected.length >= (char.length * 2))

            if (isWrappedInside) {
                // Remove wrappers from outside selection
                newValue = text.substring(0, start - char.length) + selected + text.substring(end + char.length)
                newStart = start - char.length
                newEnd = end - char.length
            } else if (isWrappedSelection) {
                // Remove wrappers from start/end of selection
                newValue = text.substring(0, start) + selected.substring(char.length, selected.length - char.length) + text.substring(end)
                newEnd = end - (char.length * 2)
            } else {
                // Apply wrapper
                newValue = text.substring(0, start) + char + selected + char + text.substring(end)
                newStart = start + char.length
                newEnd = end + char.length
            }

            textarea.value = newValue
            textarea.setSelectionRange(newStart, newEnd)
            textarea.dispatchEvent(new Event('input'))
            updateFormatButtons(index)
            textarea.focus()
        })
    })

    // --- INSERT VARIABLE BUTTON ---
    container.querySelectorAll('.insert-var-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = btn.dataset.index
            const textarea = container.querySelector(`#variant-editor-${index}`)

            if (!textarea) return

            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const text = textarea.value
            const insert = "{name}"

            const newText = text.substring(0, start) + insert + text.substring(end)
            textarea.value = newText

            // Trigger input event
            textarea.dispatchEvent(new Event('input'))

            textarea.focus()
        })
    })

    // --- TEXT EDITORS & FORMATTING ---
    container.querySelectorAll('.variant-editor').forEach(textarea => {
        const idx = parseInt(textarea.dataset.index)

        textarea.addEventListener('input', (e) => {
            const val = e.target.value
            _messageVariants[idx] = val

            // Update char count
            const counter = container.querySelector(`#char-count-${idx}`)
            if (counter) counter.innerText = `${val.length} CHARACTERS`

            // Update live preview IMMEDIATELY
            const preview = container.querySelector('#live-preview-text')
            if (preview && idx === (window._activeVariantIdx || 0)) {
                preview.innerHTML = formatPreviewText(val)

                // AUTO-SCROLL to the bottom of the phone screen
                const chatBody = container.querySelector('.phone-chat-body')
                if (chatBody) {
                    chatBody.scrollTop = chatBody.scrollHeight
                }
            }

            saveCurrentProject()
        })

        // UPDATE BUTTON STATES ON NAV/TYPING
        textarea.addEventListener('keyup', () => updateFormatButtons(idx))
        textarea.addEventListener('mouseup', () => updateFormatButtons(idx))
        textarea.addEventListener('select', () => updateFormatButtons(idx))
    })

    // --- NEW VARIANT ---
    container.querySelector('#add-variant-btn')?.addEventListener('click', () => {
        _messageVariants.push("New variant content...")
        window._activeVariantIdx = _messageVariants.length - 1
        saveCurrentProject()
        render()
    })

    container.querySelector('#delete-variant-btn')?.addEventListener('click', async () => {
        if (_messageVariants.length <= 1) return
        if (await titanConfirm('Delete Variant', 'Remove this message variant?')) {
            const idx = parseInt(selector.value)
            _messageVariants.splice(idx, 1)
            window._activeVariantIdx = Math.max(0, idx - 1)
            saveCurrentProject()
            render()
        }
    })

    // --- FORMATTING BUTTONS ---
    container.querySelectorAll('.fmt-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = btn.dataset.index
            const type = btn.dataset.fmt
            const textarea = container.querySelector(`#variant - editor - ${idx} `)
            if (!textarea) return

            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const text = textarea.value
            const sel = text.substring(start, end)

            let wrapped = sel
            if (type === 'bold') wrapped = `* ${sel}* `
            if (type === 'italic') wrapped = `_${sel} _`
            if (type === 'strike') wrapped = `~${sel} ~`

            const newText = text.substring(0, start) + wrapped + text.substring(end)
            textarea.value = newText
            _messageVariants[idx] = newText

            // Restore selection / focus
            textarea.focus()

            // Trigger input event to update preview
            textarea.dispatchEvent(new Event('input'))
        })
    })

    // --- INSERT VAR ---
    container.querySelectorAll('.insert-var-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = btn.dataset.index
            const textarea = container.querySelector(`#variant - editor - ${idx} `)
            if (!textarea) return

            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const text = textarea.value
            const padding = " " // space padding
            const insert = "{name}"

            const newText = text.substring(0, start) + insert + text.substring(end)
            textarea.value = newText
            _messageVariants[idx] = newText
            textarea.focus()
            textarea.dispatchEvent(new Event('input'))
        })
    })

    // --- MEDIA ---
    const dropZone = container.querySelector('#media-drop-zone')
    const fileInput = container.querySelector('#media-file-input')

    dropZone?.addEventListener('click', () => fileInput.click())

    // Drag and Drop
    dropZone?.addEventListener('dragover', (e) => {
        e.preventDefault()
        dropZone.style.borderColor = 'var(--primary)'
        dropZone.style.background = '#eff6ff'
    })
    dropZone?.addEventListener('dragleave', () => {
        dropZone.style.borderColor = _attachedMediaName ? 'var(--primary)' : '#cbd5e1'
        dropZone.style.background = _attachedMediaName ? '#f0fdf4' : '#f8fafc'
    })
    dropZone?.addEventListener('drop', (e) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file) {
            _attachedMedia = file.path
            _attachedMediaName = file.name
            saveCurrentProject()
            render()
        }
    })

    fileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0]
        if (file) {
            _attachedMedia = file.path
            _attachedMediaName = file.name
            saveCurrentProject()
            render()
        }
    })

    container.querySelector('#remove-media-btn')?.addEventListener('click', (e) => {
        e.stopPropagation()
        _attachedMedia = null
        _attachedMediaName = ''
        saveCurrentProject()
        render()
    })

    container.querySelector('#media-mode-select')?.addEventListener('change', (e) => {
        _mediaSendMode = e.target.value
        saveCurrentProject()
    })
}








function renderAutoReply() {
    return `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:32px;">
          <div>
              <h2 style="margin:0; font-size:28px; font-weight:800; color:#1e293b; letter-spacing:-0.03em;">Auto-Reply Guardian</h2>
              <p style="color:#64748b; margin:6px 0 0 0; font-size:14px; font-weight:500;">Automate intelligent responses based on incoming triggers.</p>
          </div>
          <div style="display:flex; align-items:center; gap:16px;">
              <div style="background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:14px; padding:10px 20px; display:flex; align-items:center; gap:12px;">
                  <span style="font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">System Status:</span>
                  <div style="display:flex; align-items:center; gap:8px;">
                      <div style="width:8px; height:8px; border-radius:50%; background:${_autoReplyEnabled ? '#22c55e' : '#94a3b8'}; box-shadow:${_autoReplyEnabled ? '0 0 10px #22c55e' : 'none'};"></div>
                      <span style="font-size:13px; font-weight:800; color:${_autoReplyEnabled ? '#1e293b' : '#94a3b8'};">${_autoReplyEnabled ? 'ACTIVE' : 'INACTIVE'}</span>
                  </div>
              </div>
              <button id="toggle-autoreply-btn" class="titan-btn" 
                      style="background:${_autoReplyEnabled ? '#fef2f2' : '#eff6ff'}; color:${_autoReplyEnabled ? '#ef4444' : '#2563eb'}; border:1px solid ${_autoReplyEnabled ? '#fee2e2' : '#dbeafe'}; border-radius:14px; padding:12px 24px; font-weight:800; font-size:13px; cursor:pointer; transition:all 0.2s;">
                ${_autoReplyEnabled ? 'Stop Guardian' : 'Activate Guardian'}
              </button>
              <button class="btn-primary" id="add-rule-btn" style="background:#2563eb; padding:12px 28px; border-radius:14px; font-weight:800; box-shadow:0 8px 16px rgba(37,99,235,0.2);">+ Create Rule</button>
          </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr; gap:20px; margin-bottom:40px;">
         ${_autoReplyRules.length === 0 ? `
            <div style="background:#fff; border:2px dashed #e2e8f0; border-radius:24px; padding:80px 40px; text-align:center;">
                <div style="font-size:64px; margin-bottom:20px;">🛡️</div>
                <h3 style="margin:0; font-size:20px; font-weight:800; color:#1e293b;">The Guardian is Awaiting Rules</h3>
                <p style="color:#64748b; font-size:15px; margin:12px 0 32px 0; max-width:400px; margin-left:auto; margin-right:auto; line-height:1.6;">Automate responses to frequently asked questions. The system will monitor incoming messages and strike back with your predefined logic.</p>
                <button class="btn-primary" onclick="document.getElementById('add-rule-btn').click()" style="background:#2563eb; padding:16px 40px; border-radius:16px; font-weight:800;">Set Your First Protocol</button>
            </div>
         ` : ''}

         ${_autoReplyRules.map((r, i) => `
            <div class="rule-card" style="background:#fff; border-radius:20px; border:1px solid #e2e8f0; padding:28px; box-shadow:0 4px 12px rgba(0,0,0,0.02); transition:all 0.2s; position:relative;">
                
                <!-- Rule Header -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
                    <div style="display:flex; align-items:center; gap:16px;">
                        <div style="width:42px; height:42px; background:#f0f7ff; color:#2563eb; border-radius:12px; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:16px; border:1px solid #dbeafe;">${i + 1}</div>
                        <div>
                            <h4 style="margin:0; font-size:15px; font-weight:900; color:#0f172a; letter-spacing:-0.01em;">Response Protocol</h4>
                            <div style="display:flex; align-items:center; gap:8px; margin-top:2px;">
                                <div style="width:6px; height:6px; background:#22c55e; border-radius:50%;"></div>
                                <span style="font-size:11px; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:0.03em;">Active Monitoring</span>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="display:flex; background:#f8fafc; padding:4px; border-radius:10px; border:1px solid #e2e8f0;">
                            <button class="rule-mode-btn ${r.mode === 'phrase' ? 'active' : ''}" data-index="${i}" data-mode="phrase" style="padding:6px 12px; border:none; background:${r.mode === 'phrase' ? '#fff' : 'transparent'}; color:${r.mode === 'phrase' ? '#2563eb' : '#64748b'}; border-radius:6px; font-size:11px; font-weight:800; cursor:pointer; box-shadow:${r.mode === 'phrase' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'};">PHRASE</button>
                            <button class="rule-mode-btn ${r.mode === 'exact' ? 'active' : ''}" data-index="${i}" data-mode="exact" style="padding:6px 12px; border:none; background:${r.mode === 'exact' ? '#fff' : 'transparent'}; color:${r.mode === 'exact' ? '#2563eb' : '#64748b'}; border-radius:6px; font-size:11px; font-weight:800; cursor:pointer; box-shadow:${r.mode === 'exact' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'};">EXACT</button>
                        </div>
                        <button class="delete-rule-btn" data-index="${i}" 
                                style="background:#fef2f2; border:1px solid #fee2e2; color:#ef4444; width:36px; height:36px; border-radius:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s;">
                            <span style="font-size:18px;">✕</span>
                        </button>
                    </div>
                </div>

                <!-- Rule Inputs -->
                <div style="display:grid; grid-template-columns: 1.2fr 1.8fr; gap:32px;">
                    
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <label style="font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">Incoming Triggers</label>
                        <div style="position:relative;">
                            <input type="text" class="rule-keyword-input" data-index="${i}" value="${r.keyword}" 
                                   placeholder="e.g. price, cost, how much"
                                   style="width:100%; padding:14px 18px; border:1.5px solid #e2e8f0; border-radius:14px; font-weight:700; font-size:14px; outline:none; color:#1e293b; background:#f8fafc; transition:all 0.2s;">
                        </div>
                        <p style="margin:4px 0 0 0; font-size:11px; color:#94a3b8; font-weight:500;">Separate multiple keywords with commas.</p>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <label style="font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.05em;">Automated Response</label>
                        <textarea class="rule-response-textarea" data-index="${i}" 
                                  placeholder="Type your response here... use {name} for personalization."
                                  style="width:100%; height:120px; padding:16px 18px; border:1.5px solid #e2e8f0; border-radius:14px; font-family:inherit; font-size:14px; line-height:1.6; outline:none; resize:none; color:#1e293b; background:#fff; transition:all 0.2s;">${r.response}</textarea>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
                            <span style="font-size:11px; color:#94a3b8; font-weight:600;">Supports {name} variable</span>
                            <span style="font-size:11px; font-weight:800; color:#cbd5e1; font-variant-numeric: tabular-nums;">${r.response.length} CHARS</span>
                        </div>
                    </div>
                </div>
            </div>
         `).join('')}
    </div>

    <!-- LIVE OUTREACH PULSE FEED -->
    <div style="margin-top:48px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:28px;">
            <div>
                <h3 style="margin:0; font-size:22px; font-weight:800; color:#1e293b; letter-spacing:-0.03em;">Guardian Activity Pulse</h3>
                <div style="display:flex; align-items:center; gap:10px; margin-top:6px;">
                    <div style="display:flex; align-items:center; gap:6px; background:#ecfdf5; padding:4px 12px; border-radius:99px; border:1px solid #d1fae5;">
                        <div style="width:6px; height:6px; background:#10b981; border-radius:50%; animation: pulse-dot 2s infinite;"></div>
                        <span style="font-size:11px; font-weight:800; color:#065f46; text-transform:uppercase; letter-spacing:0.05em;">Monitoring Live Stream</span>
                    </div>
                </div>
            </div>
            <button id="clear-guardian-log" style="background:#fff; border:1.5px solid #e2e8f0; color:#64748b; font-size:12px; padding:10px 20px; border-radius:14px; font-weight:800; cursor:pointer; transition:all 0.2s; box-shadow:0 2px 4px rgba(0,0,0,0.02);">Clear Activity Stack</button>
        </div>

        <div id="guardian-log-container" style="height:480px; overflow-y:auto; padding:4px; margin:0 -4px; scroll-behavior:smooth;">
            ${_botActivity.length === 0 ? `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:350px; background:#fff; border:2px dashed #e2e8f0; border-radius:32px; transition:all 0.3s;">
                    <div style="width:90px; height:90px; background:#f8fafc; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-bottom:24px; position:relative;">
                        <div style="position:absolute; width:100%; height:100%; border:2px solid #3b82f6; border-radius:50%; animation: radar-pulse 2s infinite;"></div>
                        <div style="position:absolute; width:100%; height:100%; border:2px solid #3b82f6; border-radius:50%; animation: radar-pulse 2s infinite 1s;"></div>
                        <span style="font-size:36px; z-index:1; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));">📡</span>
                    </div>
                    <div style="font-size:14px; font-weight:900; color:#1e293b; letter-spacing:0.05em; text-transform:uppercase;">Scanning Network Context...</div>
                    <p style="margin:8px 0 0 0; font-size:13px; color:#94a3b8; font-weight:600; text-align:center; max-width:300px; line-height:1.5;">The Guardian is live and intercepting incoming messages for context matching.</p>
                </div>
            ` : _botActivity.map(log => {
        let color = '#3b82f6';
        let icon = '🎯';
        let bg = '#eff6ff';
        const action = log.action.toUpperCase();

        if (action === 'INCOMING' || action === 'MATCHING') { color = '#3b82f6'; icon = '🔍'; bg = '#eff6ff'; }
        if (action === 'CONVERSION') { color = '#f59e0b'; icon = '🏆'; bg = '#fffbeb'; }
        if (action === 'BOT_SENT') { color = '#10b981'; icon = '✅'; bg = '#f0fdf4'; }
        if (action === 'ERROR') { color = '#ef4444'; icon = '❌'; bg = '#fef2f2'; }

        return `
                    <div style="display:flex; align-items:center; gap:24px; background:#fff; border:1px solid #e2e8f0; border-radius:24px; padding:20px 28px; margin-bottom:16px; box-shadow:0 10px 15px -3px rgba(0,0,0,0.02), 0 4px 6px -2px rgba(0,0,0,0.01); transition:all 0.3s; animation: slideInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; position:relative; overflow:hidden;">
                        <div style="position:absolute; left:0; top:0; bottom:0; width:6px; background:${color}; opacity:0.8;"></div>
                        <div style="width:52px; height:52px; border-radius:16px; background:${bg}; color:${color}; display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0; border:1px solid ${color}15;">
                            ${icon}
                        </div>
                        <div style="flex:1;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <span style="font-size:11px; font-weight:900; color:${color}; text-transform:uppercase; letter-spacing:0.08em; background:${bg}; padding:2px 10px; border-radius:6px;">${action}</span>
                                    <span style="font-size:14px; font-weight:800; color:#1e293b; letter-spacing:-0.01em;">${log.lead}</span>
                                </div>
                                <span style="font-size:11px; font-weight:700; color:#94a3b8; font-variant-numeric:tabular-nums; background:#f8fafc; padding:4px 10px; border-radius:8px; border:1px solid #f1f5f9;">${log.time}</span>
                            </div>
                            <div style="font-size:14px; color:#64748b; font-weight:600; line-height:1.5;">
                                ${log.details}
                            </div>
                        </div>
                    </div>
                `
    }).reverse().join('')}
        </div>
    </div>
    
    <div style="margin-top:40px; background:linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border:1px solid #e2e8f0; border-radius:24px; padding:24px; display:flex; align-items:center; gap:20px; box-shadow:0 4px 12px rgba(0,0,0,0.02);">
        <div style="width:48px; height:48px; background:#fff; border-radius:16px; display:flex; align-items:center; justify-content:center; font-size:24px; box-shadow:0 4px 8px rgba(0,0,0,0.05); border:1px solid #f1f5f9;">💡</div>
        <div style="flex:1;">
            <div style="font-size:14px; font-weight:900; color:#0f172a; margin-bottom:2px; letter-spacing:-0.01em;">Pro-Tip: Context Intelligence</div>
            <p style="margin:0; font-size:13px; color:#64748b; font-weight:600; line-height:1.5;">The Guardian learns from interaction patterns. Use <b>{name}</b> to ensure every automated "strike" feels personal and human-driven.</p>
        </div>
    </div>
`
}



function setupAutoReplyListeners(container) {
    const sync = () => {
        window.api.updateAutoReplySettings({ enabled: _autoReplyEnabled, rules: _autoReplyRules })
        window.api.configSave({ autoReplyEnabled: _autoReplyEnabled, autoReplyRules: _autoReplyRules })
    }

    container.querySelector('#toggle-autoreply-btn')?.addEventListener('click', () => {
        _autoReplyEnabled = !_autoReplyEnabled
        sync()
        render()
    })

    container.querySelector('#add-rule-btn')?.addEventListener('click', () => {
        _autoReplyRules.unshift({ keyword: '', response: '', mode: 'phrase' }) // Put new rules at top
        sync()
        render()

        // Focus the new keyword input immediately
        setTimeout(() => {
            const firstInput = container.querySelector('.rule-keyword-input')
            if (firstInput) firstInput.focus()
        }, 50)
    })

    container.querySelectorAll('.rule-keyword-input').forEach(input => {
        input.addEventListener('input', () => {
            const idx = parseInt(input.dataset.index)
            if (_autoReplyRules[idx]) {
                _autoReplyRules[idx].keyword = input.value
                sync()
            }
        })
    })

    container.querySelectorAll('.rule-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index)
            const mode = btn.dataset.mode
            if (_autoReplyRules[idx]) {
                _autoReplyRules[idx].mode = mode
                sync()
                render() // Re-render to show active state
            }
        })
    })

    container.querySelectorAll('.rule-response-textarea').forEach(area => {
        area.addEventListener('input', () => {
            const idx = parseInt(area.dataset.index)
            if (_autoReplyRules[idx]) {
                _autoReplyRules[idx].response = area.value
                sync()
            }
        })
    })

    container.querySelectorAll('.delete-rule-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const idx = parseInt(btn.dataset.index)
            if (await window.titanConfirm('Delete Rule', 'Remove this auto-reply rule from the Guardian?')) {
                _autoReplyRules.splice(idx, 1)
                sync()
                render()
            }
        })
    })

    container.querySelector('#clear-guardian-log')?.addEventListener('click', () => {
        _botActivity = []
        render()
    })
}


// TITAN HELPER: Archive active campaigns to history before wipe
function _archiveActiveCampaigns() {
    let sessionReplied = 0;

    _activeCampaigns.forEach(c => {
        let campSent = 0
        let campReplied = 0
        let campFailed = 0
        const archivedVariants = []

        if (c.variantStats) {
            c.variantStats.forEach((vs, vIdx) => {
                // TITAN FIX: Calculate stats directly from LEADS to ensure accuracy
                const leadsForVariant = (c.leads || []).filter(l => l.variantNum === (vIdx + 1))

                const sent = leadsForVariant.filter(l => l.status === 'SENT').length
                const failed = leadsForVariant.filter(l => l.status === 'FAILED').length
                const replied = (vs.replied || 0)

                campSent += sent
                campReplied += replied
                sessionReplied += replied

                archivedVariants.push({
                    text: vs.text,
                    sent: sent,
                    replied: replied,
                    failed: failed
                })
            })
        }

        // Sum of all variant failures for campaign total
        campFailed = archivedVariants.reduce((sum, v) => sum + v.failed, 0)

        // Push to history only if there was activity (sent or failed)
        if (campSent > 0 || campFailed > 0) {
            _campaignHistory.push({
                id: c.id,
                timestamp: Date.now(),
                stats: { sent: campSent, replied: campReplied, failed: campFailed },
                variants: archivedVariants
            })
        }
    })

    if (sessionReplied > 0) {
        _campaignStats.totalReceived = (_campaignStats.totalReceived || 0) + sessionReplied
    }
    // Save to disk
    window.api.configSave({ campaignHistory: _campaignHistory, campaignStats: _campaignStats })
}


function renderAnalytics(container) {
    // TITAN LIFETIME-ONLY: Aggregate ALL data (History + Active Session)

    // 1. Gather Active Campaign Data (Current Session)
    const activeStats = { sent: 0, replied: 0, failed: 0, variants: [] }
    Array.from(_activeCampaigns.values()).forEach(c => {
        if (c.variantStats) {
            c.variantStats.forEach((vs, vIdx) => {
                activeStats.sent += (vs.sent || 0)
                activeStats.replied += (vs.replied || 0)
                activeStats.variants.push({
                    text: vs.text,
                    sent: vs.sent,
                    replied: vs.replied,
                    failed: c.leads ? c.leads.filter(l => l.variantNum === (vIdx + 1) && l.status === 'FAILED').length : 0
                })
            })
        }
        if (c.leads) activeStats.failed += c.leads.filter(l => l.status === 'FAILED').length
    })

    // 2. Lifetime Totals (ALL History + Active Session)
    let lifetimeSent = activeStats.sent
    let lifetimeReplied = activeStats.replied
    let lifetimeFailed = activeStats.failed

    _campaignHistory.forEach(h => {
        lifetimeSent += (h.stats?.sent || 0)
        lifetimeReplied += (h.stats?.replied || 0)
        lifetimeFailed += (h.stats?.failed || 0)
    })

    const totalAttempts = lifetimeSent + lifetimeFailed
    const successRate = totalAttempts > 0 ? Math.round((lifetimeSent / totalAttempts) * 100) : 0

    // 3. Aggregate ALL Variants for Matrix (History + Active)
    const matrixMap = new Map()
    const mergeVariant = (v) => {
        if (!matrixMap.has(v.text)) matrixMap.set(v.text, { text: v.text, sent: 0, replied: 0, failed: 0 })
        const entry = matrixMap.get(v.text)
        entry.sent += (v.sent || 0)
        entry.replied += (v.replied || 0)
        entry.failed += (v.failed || 0)
    }

    _campaignHistory.forEach(h => { if (h.variants) h.variants.forEach(mergeVariant) })
    activeStats.variants.forEach(mergeVariant)

    const matrixData = Array.from(matrixMap.values())

    const html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:32px;">
              <div>
                 <h2 style="margin:0; font-weight:800; letter-spacing:-0.03em;">Intelligence Dashboard</h2>
                 <p style="color:var(--text-muted); margin:4px 0 0 0;">Lifetime performance metrics and campaign health.</p>
              </div>
              <div style="display:flex; gap:12px; align-items:center;">
                  <button class="btn-secondary" id="reset-stats-btn" style="color:var(--status-error);">Reset History</button>
              </div>
           </div >
           
           <!--STAT CARDS-->
           <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:20px; margin-bottom:32px;">
              <div class="card" style="padding:24px; border-top:4px solid var(--titan-blue);">
                 <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Total Contacts Reached</div>
                 <div style="font-size:32px; font-weight:800;">${lifetimeSent.toLocaleString()}</div>
              </div>

              <div class="card" style="padding:24px; border-top:4px solid var(--status-ready);">
                 <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Lifetime Success Rate</div>
                 <div style="font-size:32px; font-weight:800;">${successRate}%</div>
              </div>

              <div class="card" style="padding:24px; border-top:4px solid var(--titan-yellow);">
                 <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Total Replies</div>
                 <div style="font-size:32px; font-weight:800;">${lifetimeReplied.toLocaleString()}</div>
              </div>

              <div class="card" style="padding:24px; border-top:4px solid var(--status-error);">
                 <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Total Failed</div>
                 <div style="font-size:32px; font-weight:800;">${lifetimeFailed.toLocaleString()}</div>
              </div>
           </div>

           <!--VARIANT MATRIX-->
           <div class="card" style="padding:24px; background:#fff; border:1px solid var(--border-light);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h3 style="margin:0; font-weight:800; font-size:16px;">Variant Performance Matrix</h3>
                    <span style="font-size:11px; font-weight:800; color:var(--titan-blue); padding:4px 10px; background:#eff6ff; border-radius:6px;">LIFETIME</span>
                </div>
                <table class="industrial-table">
                    <thead>
                        <tr>
                            <th style="width:40px;">#</th>
                            <th>Message Variant Outline</th>
                            <th style="text-align:center;">Success</th>
                            <th style="text-align:center; color:var(--status-error);">Failed</th>
                            <th style="text-align:center;">Replies (Conv.)</th>
                            <th style="text-align:center;">Resp. Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${matrixData.length === 0 ? `
                            <tr><td colspan="6" style="text-align:center; padding:40px; color:var(--text-muted); font-style:italic;">No performance data yet. Run a campaign to see metrics here.</td></tr>
                        ` : ''}
                        ${matrixData.map((stat, vIdx) => {
        const rate = stat.sent > 0 ? Math.round((stat.replied / stat.sent) * 100) : 0
        const progressColor = rate > 20 ? '#10b981' : (rate > 10 ? '#f59e0b' : '#64748b')
        return `
                                <tr>
                                    <td style="font-family:monospace; font-weight:800; color:var(--text-muted);">${vIdx + 1}</td>
                                    <td style="max-width:400px; padding:12px;">
                                        <div style="font-size:14px; color:var(--titan-black); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${stat.text}</div>
                                        <button class="view-variant-btn" data-message="${encodeURIComponent(stat.text)}" style="background:none; border:none; color:var(--primary); font-size:11px; font-weight:700; cursor:pointer; padding:0; margin-top:4px;">VIEW FULL MESSAGE</button>
                                    </td>
                                    <td style="text-align:center; font-weight:800; font-size:14px;">${stat.sent}</td>
                                    <td style="text-align:center; font-weight:800; color:var(--var-red, #dc2626); font-size:14px;">${stat.failed}</td>
                                    <td style="text-align:center; font-weight:800; color:var(--titan-blue); font-size:14px;">${stat.replied}</td>
                                    <td style="text-align:center;">
                                        <div style="display:flex; align-items:center; gap:8px; justify-content:center;">
                                            <div style="width:60px; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                                                <div style="width:${rate}%; height:100%; background:${progressColor};"></div>
                                            </div>
                                            <span style="font-weight:900; color:${progressColor}; font-size:13px;">${rate}%</span>
                                        </div>
                                    </td>
                                </tr>
                            `
    }).join('')}
                    </tbody>
                </table>
           </div>
           
           <!-- Removed Behavioral Intelligence Pipeline as requested -->
`
    if (container.innerHTML !== html) {
        container.innerHTML = html
        setupAnalyticsListeners(container)
    }
}

function setupAnalyticsListeners(container) {
    // Variant Viewer (Delegated)
    container.querySelectorAll('.view-variant-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const raw = e.currentTarget.getAttribute('data-message')
            if (raw) {
                window.titanAlert('Full Message Variant', decodeURIComponent(raw))
            }
        })
    })

    const resetBtn = container.querySelector('#reset-stats-btn')
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            if (await window.titanConfirm('Reset Intelligence', "Reset all historical intelligence data? This cannot be undone.")) {
                // Wipe active campaign stats
                _activeCampaigns.clear()
                
                // Clear the stats
                _campaignStats = { totalSent: 0, totalFailed: 0, totalReceived: 0, activeCampaigns: 0 }
                _campaignHistory = []
                
                // Sync to disk
                window.api.configSave({ campaignStats: _campaignStats, campaignHistory: [] })
                render()
            }
        })
    }
}




// --- DEPRECATED LISTENERS ---





// ================= OUTREACH LISTENERS (ENHANCED) =================
window.api.onCampaignProgress(({ campaignId, number, sent, total, status, contacts }) => {
    // 1. Locate Campaign Context
    let activeCamp = _activeCampaigns.get(campaignId)
    if (!activeCamp && campaignId) {
        // Fallback for direct queue updates
        activeCamp = { leads: window._activeCampaignQueue || [] }
    }

    // 2. Update Global Analytics FIRST (before overwriting leads)
    //    Change detection compares incoming status vs local status
    if (contacts && activeCamp) {
        let changed = false
        contacts.forEach(c => {
            const localLead = activeCamp.leads.find(l => l.phone === c.phone)

            // Only increment global stats if the status has actually CHANGED for this lead
            if (localLead && localLead.status !== c.status) {
                if (c.status === 'SENT') {
                    _campaignStats.totalSent++
                    changed = true
                } else if (c.status === 'FAILED') {
                    _campaignStats.totalFailed++
                    changed = true
                }
            }
        })
        if (changed) {
            // TITAN: Continuous State Persistence (Power-Cut Safety)
            // Save both stats and the full session state
            const sessionSnapshot = Array.from(_activeCampaigns.entries())
            window.api.configSave({
                campaignStats: _campaignStats,
                activeCampaignsSession: sessionSnapshot
            })
        }
    }

    // 3. NOW sync campaign state (overwrite leads with latest data)
    //    This MUST happen AFTER change detection above
    if (activeCamp && campaignId && _activeCampaigns.has(campaignId)) {
        if (contacts) activeCamp.leads = contacts
        if (status) activeCamp.status = status
        refreshBannerUI(campaignId)
    }

    // Update the rows if they exist in the UI
    if (contacts) {
        // TITAN: Route to correct campaign list
        let targetQueue = window._activeCampaignQueue
        if (campaignId && _activeCampaigns.has(campaignId)) {
            targetQueue = _activeCampaigns.get(campaignId).leads
        }

        contacts.forEach(c => {
            const l = targetQueue.find(ld => ld.phone === c.phone)
            const row = document.getElementById(`launch-row-${c.phone}`)

            if (l && l.status !== c.status) {
                l.status = c.status
                l.timestamp = Date.now()
                if (c.status === 'SENT' || c.status === 'FAILED') {
                    l.senderNumber = number
                    if (c.status === 'SENT') l.variantNum = c.variantNum
                }
            }

            if (row) {
                // Legacy rows update
                const workerCell = row.querySelector('.worker-cell')
                if (workerCell && number) workerCell.innerText = `+ ${number} `
                const statusDot = row.querySelector('.status-dot')
                const statusText = row.querySelector('.status-cell')
                if (c.status === 'SENT') {
                    if (statusDot) statusDot.className = 'status-dot sent'
                    if (statusText) statusText.innerHTML = '<span class="status-dot sent"></span>SENT'
                    row.style.background = '#f0fdf4'
                } else if (c.status === 'FAILED') {
                    if (statusDot) statusDot.className = 'status-dot failed'
                    if (statusText) statusText.innerHTML = '<span class="status-dot failed"></span>FAILED'
                    row.style.background = '#fef2f2'
                }
            }
        })

        // RECALCULATE & UPDATE STATS (LIVE)
        let cSent = 0, cFailed = 0, cPending = 0;
        targetQueue.forEach(l => {
            if (l.status === 'SENT') cSent++;
            else if (l.status === 'FAILED') cFailed++;
            else cPending++;
        });

        // Update Launch View Surgically
        if (_innerSendTab === 'launch') {
            const total = targetQueue.length
            const progress = total > 0 ? ((cSent + cFailed) / total) * 100 : 0

            const elTotal = document.getElementById('launch-stat-total')
            const elSent = document.getElementById('launch-stat-sent')
            const elPending = document.getElementById('launch-stat-pending')
            const elFailed = document.getElementById('launch-stat-failed')
            const elPercent = document.getElementById('launch-progress-percent')
            const elBar = document.getElementById('launch-progress-bar')
            const elBody = document.getElementById('launch-activity-body')

            if (elTotal) elTotal.innerText = total
            if (elSent) elSent.innerText = cSent
            if (elPending) elPending.innerText = cPending
            if (elFailed) elFailed.innerText = cFailed
            if (elPercent) elPercent.innerText = `${Math.round(progress)}% `
            if (elBar) elBar.style.width = `${progress}% `

            if (elBody && contacts.length > 0) {
                contacts.forEach(c => {
                    // Try to find existing row
                    let tr = document.getElementById(`launch-row-${c.phone}`)

                    // If row doesn't exist, create it (safe fallback, though renderLaunchStep should have created it)
                    if (!tr) {
                        tr = document.createElement('tr')
                        tr.id = `launch-row-${c.phone}`
                        tr.style.borderBottom = '1px solid #f1f5f9'
                        tr.innerHTML = `
                            <td style="font-family:monospace; font-weight:700;">+${c.phone}</td>
                            <td class="worker-cell" style="font-size:12px; font-weight:700; color:var(--primary); font-family:monospace;">-</td>
                            <td style="color:var(--text-muted); font-weight:500;">${c.name || '-'}</td>
                            <td><span class="status-badge titan-badge-pill">PENDING</span></td>
                            <td class="time-cell" style="text-align:right; font-size:11px; color:var(--text-muted);">-</td>
                        `
                        elBody.insertBefore(tr, elBody.firstChild)
                        if (elBody.children.length > 100) elBody.lastElementChild.remove()
                    } else {
                        // Move to top to show activity
                        elBody.insertBefore(tr, elBody.firstChild)
                    }

                    // Update Styles & Content
                    tr.style.background = c.status === 'SENT' ? '#f0fdf4' : (c.status === 'FAILED' ? '#fef2f2' : 'transparent')
                    
                    const workerCell = tr.querySelector('.worker-cell')
                    if (workerCell && number) workerCell.innerText = `+${number}`

                    const badge = tr.querySelector('.status-badge')
                    if (badge) {
                        badge.innerText = c.status || 'PENDING'
                        // Update classes
                        badge.className = `status-badge titan-badge-pill ${c.status === 'SENT' ? 'titan-badge-green' : (c.status === 'FAILED' ? 'titan-badge-red' : 'status-badge-pending')}`
                        // Update styles
                        badge.style.color = c.status === 'SENT' ? '#166534' : (c.status === 'FAILED' ? '#991b1b' : '#64748b')
                        badge.style.background = c.status === 'SENT' ? '#dcfce7' : (c.status === 'FAILED' ? '#fee2e2' : '#f1f5f9')
                    }

                    const timeCell = tr.querySelector('.time-cell')
                    if (timeCell) timeCell.innerText = new Date().toLocaleTimeString()
                })
            }
        }
    }

    // Auto-update summary counters without full render
    const efficiency = document.getElementById('execution-efficiency')
    if (efficiency) efficiency.innerText = `LAST UPDATE: ${new Date().toLocaleTimeString()} (Worker + ${number})`

    // 🚀 TITAN: COMPLETION MONITOR
    const totalProcessed = sent + failed
    if (totalProcessed >= total && total > 0) {
        // Update project status to COMPLETED
        const proj = _campaignProjects.find(p => p.engineId === campaignId)
        if (proj && proj.status !== 'COMPLETED') {
            proj.status = 'COMPLETED'
            proj.step = 'leads' // Reset for next use
            // Save immediately to ensure persistence
            window.api.configSave({ campaignProjects: _campaignProjects })
        }

        // Debounce alert
        if (!window._lastFinishNotify || Date.now() - window._lastFinishNotify > 10000) {
            window._lastFinishNotify = Date.now()
            titanAlert('Mission Accomplished', `Campaign ${campaignId.split('_')[1]} has finished successfully.\n\nTotal Sent: ${sent} \nFailed: ${failed} `)
        }
    }
})


window.api.onNetworkLost(() => {
    console.warn('[APP] 📡 NETWORK LOST. Guardian engaging...')
    const label = document.getElementById('global-progress-label')
    if (label) {
        label.innerText = '📡 NETWORK LOST - PAUSED'
        label.style.background = 'var(--titan-red)'
    }
    const bar = document.getElementById('top-bar')
    if (bar) bar.style.borderTop = '4px solid var(--titan-red)'
})

window.api.onNetworkRestored(() => {
    console.log('[APP] 🌐 NETWORK RESTORED. Awaiting Resume.')
    const label = document.getElementById('global-progress-label')
    if (label) {
        label.innerHTML = '🌐 RESTORED - <button id="manual-resume-btn" style="background:none; border:none; color:#fff; font-weight:800; text-decoration:underline; cursor:pointer; padding:0;">RESUME NOW</button>'
        label.querySelector('#manual-resume-btn').onclick = () => {
            window.api.campaignResume()
            label.innerText = 'SYSTEM RUNNING'
            label.style.background = 'var(--titan-blue)'
            const bar = document.getElementById('top-bar')
            if (bar) bar.style.borderTop = 'none'
        }
    }
})





// 🚀 TITAN: CAMPAIGN STATUS & DELAY HANDLER (MULTI-INSTANCE)
// 🚀 TITAN: CAMPAIGN STATUS & DELAY HANDLER (MULTI-INSTANCE)
window.api.onCampaignStatusUpdate(({ campaignId, status, duration, details }) => {
    // 1. Kill Switch & Context Check
    if (window._titanStopping || localStorage.getItem('titan_kill') === 'true') return
    if (!_activeCampaigns.has(campaignId)) return
    const activeCamp = _activeCampaigns.get(campaignId)

    const prevStatus = activeCamp.status
    // 2. Synchronize Internal State
    activeCamp.status = status;

    // 3. Handle Waiting / Randomized Delays
    if (status === 'WAITING') {
        if (activeCamp.countdownInterval) clearInterval(activeCamp.countdownInterval)
        activeCamp.waitState = { 
            active: true, 
            seconds: duration || 0, 
            details: details || 'Protocols Active',
            until: Date.now() + ((duration || 0) * 1000)
        }

        const updateUI = () => {
            if (activeCamp.status !== 'WAITING' || window._titanStopping || localStorage.getItem('titan_kill') === 'true') {
                clearInterval(activeCamp.countdownInterval)
                return
            }
            if (activeCamp.waitState.seconds > 0) {
                activeCamp.waitState.seconds--
                activeCamp.waitState.until = Date.now() + (activeCamp.waitState.seconds * 1000)
            } else {
                clearInterval(activeCamp.countdownInterval)
                activeCamp.waitState.active = false
            }
            // Continuous render for countdown is necessary here, though we try to only do it in 'launch' tab
            if (activeTab === 'campaigns' && _innerSendTab === 'launch') render()
        }

        updateUI()
        activeCamp.countdownInterval = setInterval(updateUI, 1000)
    } else {
        if (activeCamp.countdownInterval) clearInterval(activeCamp.countdownInterval)
        activeCamp.waitState = { active: false, seconds: 0, details: '' }
        window._waitingUntil = 0
        window._waitingDetails = ''

        // ONLY RENDER IF STATUS ACTUALLY CHANGED TO AVOID FLICKER
        if (prevStatus !== status) {
            render()
        }
    }
})


window.api.onCampaignStateUpdated(({ campaignId, state }) => {
    if (_activeCampaigns.has(campaignId)) {
        const camp = _activeCampaigns.get(campaignId)
        camp.variantStats = state.variantStats
        camp.variants = state.variants
        // If we are currently in the analytics tab, re-render to show updates
        if (activeTab === 'reports') render()
    }
})



// Global Countdown Ticker
setInterval(() => {
    if (window._waitingUntil && window._waitingUntil > Date.now()) {
        const remaining = Math.ceil((window._waitingUntil - Date.now()) / 1000)
        document.querySelectorAll('.live-countdown').forEach(el => {
            el.innerText = remaining + 's'
        })
    } else if (window._waitingUntil && window._waitingUntil <= Date.now()) {
        // Timer expired, clear it
        window._waitingUntil = 0
        // Optional: Trigger render to remove banner? 
        // We act lazy and let next api event update it, roughly.
        // But for UI snap, we can force update text
        document.querySelectorAll('.live-countdown').forEach(el => {
            el.innerText = '0s'
        })
    }
}, 500)

// --- GLOBAL EVENT DELEGATION FOR UI CONTROLS ---
document.addEventListener('click', (e) => {
    // 1. Sidebar Pause/Resume Button
    const pauseBtn = e.target.closest('#sidebar-pause-btn')
    if (pauseBtn) {
        e.stopPropagation()
        const pausedModal = document.getElementById('paused-modal')

        // Check if we are currently paused (modal is active) or running
        if (pausedModal && !pausedModal.classList.contains('active')) {
            console.log('[UI] Pause Clicked')
            window.api.campaignPause()
            pausedModal.classList.add('active')
            pauseBtn.innerHTML = '▶ Resume'
        } else if (pausedModal) {
            console.log('[UI] Resume Clicked (Sidebar)')
            window.api.campaignResume()
            pausedModal.classList.remove('active')
            pauseBtn.innerHTML = '⏸ Pause'
        }
    }

    // 2. Sidebar Stop Button
    const stopBtn = e.target.closest('#sidebar-stop-btn')
    if (stopBtn) {
        e.stopPropagation()
        // INSTANT STOP - No confirmation to ensure immediate cleanup
        console.log('[UI] Stop Clicked (Surgical)')
        window._titanStopping = true; localStorage.setItem('titan_kill', 'true'); // ACTIVATE KILL SWITCH

        // --- SURGICAL STOP ---
        window.api.campaignStop() // Only stops outreach, keeps browser open

        // UI CLEANUP
        _activeCampaigns.clear()
        if (_statusTimer) { clearInterval(_statusTimer); _statusTimer = null; }
        const banner = document.getElementById('campaign-status-banner')
        if (banner) banner.classList.add('hidden')
        const pausedModal = document.getElementById('paused-modal')
        if (pausedModal) pausedModal.classList.remove('active')

        _campaignWaitState.active = false
        render()
        // FORCE BUTTON RESET (SIDEBAR)
        setTimeout(() => {
            const lb = document.getElementById('sidebar-launch-btn')
            if (lb) {
                lb.innerHTML = 'Start Campaign'
                lb.disabled = false
                lb.style.background = ''
                lb.style.color = ''
                lb.style.cursor = 'pointer'
            }
        }, 50)
    }

    // 3. Modal Resume Button
    const resumeBtn = e.target.closest('#resume-campaign-btn')
    if (resumeBtn) {
        console.log('[UI] Resume Clicked (Modal)')
        window.api.campaignResume()
        const pausedModal = document.getElementById('paused-modal')
        if (pausedModal) pausedModal.classList.remove('active')

        const pBtn = document.getElementById('sidebar-pause-btn')
        if (pBtn) pBtn.innerHTML = '⏸ Pause'
    }

    // 4. Dashboard Pause Button
    const dashPauseBtn = e.target.closest('#campaign-pause-btn')
    if (dashPauseBtn) {
        e.stopPropagation()
        const activeCamp = _activeCampaigns.get(_viewingCampaignId) || {}
        if (activeCamp.status === 'PAUSED') {
            window.api.campaignResume()
        } else {
            window.api.campaignPause()
        }
        // Minimal optimistic feedback: The actual change is driven by status update
        // We removed the manual render() call here to prevent double-flicker
    }

    // 5. Dashboard Stop Button
    const dashStopBtn = e.target.closest('#campaign-stop-btn')
    if (dashStopBtn) {
        window.api.campaignStop()
        _activeCampaigns.clear()
        _campaignView = 'gallery'
        render()
    }
})

// --- ZOMBIE KILLER POLLER ---
// Forcefully suppresses rogue UI updates and timers when the kill switch is active
setInterval(() => {
    if (window._titanStopping || localStorage.getItem('titan_kill') === 'true') {
        const banner = document.getElementById('campaign-status-banner')
        if (banner && !banner.classList.contains('hidden')) {
            console.log('[POLLER] Suppressing Zombie Banner')
            banner.classList.add('hidden')
        }
        if (_statusTimer) {
            console.log('[POLLER] Suppressing Zombie Timer')
            clearInterval(_statusTimer)
            _statusTimer = null
        }
    }
}, 250)

// ═══════════════════════════════════════════════════════════
// TITAN SHIELD: GLOBAL STABILITY GUARDIAN
// ═══════════════════════════════════════════════════════════
window.addEventListener('error', (event) => {
    // Prevent white screen of death by suppressing generic crashes
    if (event.message && (event.message.includes('Script error') || event.message.includes('ResizeObserver'))) {
        return; // Ignore noise
    }
    console.error('[TITAN CRITICAL] Uncaught System Exception:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.warn('[TITAN WARNING] Async Operation Failed:', event.reason);
    // Prevent harsh crashes from floating promises
    event.preventDefault();
});

// ================= TITAN 3.0: MODULE RENDERERS =================
let _warmerState = null
let _warmerListenerSet = false

function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab
            if (tab) {
                // Reset campaign wizard when leaving campaigns tab
                if (activeTab === 'campaigns' && tab !== 'campaigns') {
                    saveCurrentProject()
                    _campaignView = 'gallery'
                    const pane = _containers['campaigns']
                    if (pane) pane.innerHTML = ''
                }
                activeTab = tab
                render()
            }
        })
    })

    // ---- Sidebar Toggle ----
    const sidebar = document.getElementById('app-sidebar')
    const toggleBtn = document.getElementById('sidebar-toggle-btn')
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed')
            const isCollapsed = sidebar.classList.contains('collapsed')
            toggleBtn.textContent = isCollapsed ? '›' : '‹'
            toggleBtn.title = isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'
        })
    }
}

// ================= TITAN 3.0: SURVIVABILITY MONITORING =================
let _survivabilityPoller = null

function setupSurvivabilityMonitoring() {
    console.log('[APP] 🛡️ Initializing Survivability Monitoring...')

    const fetchStats = async () => {
        try {
            if (!window.api || !window.api.getSurvivabilityStats) return
            const stats = await window.api.getSurvivabilityStats()
            if (stats) {
                _survivabilityStats = stats
                // Only re-render if we're on the dashboard tab to avoid unnecessary renders
                if (activeTab === 'dashboard') render()
            }
        } catch (err) {
            console.warn('[APP] Survivability fetch failed (non-fatal):', err.message)
        }
    }

    // Initial fetch after a short delay to let workers initialize
    setTimeout(fetchStats, 3000)

    // Poll every 60 seconds for updated stats
    if (_survivabilityPoller) clearInterval(_survivabilityPoller)
    _survivabilityPoller = setInterval(fetchStats, 60000)
}

function renderDashboard(container) {
    const stats = _survivabilityStats || { overview: {}, accounts: [] }
    const rawOv = stats.overview || {}
    const ov = {
        totalHealth: rawOv.totalHealth ?? 100,
        status: rawOv.status || 'READY',
        color: rawOv.color || '#22c55e',
        remark: rawOv.remark || 'all systems normal. your accounts are safe and working well.',
        riskAccounts: rawOv.riskAccounts || 0,
        criticalAccounts: rawOv.criticalAccounts || 0,
        avgDeliveryRate: rawOv.avgDeliveryRate || 0,
        totalSent: rawOv.totalSent || 0,
        repliesReceived: rawOv.repliesReceived || 0,
        activeDevicesCount: rawOv.activeDevicesCount || 0
    }



    container.innerHTML = `
    <div class="dashboard-layout" style="display:flex; flex-direction:column; gap:24px;">
        
        <!-- TITAN SURVIVABILITY RADAR (TOP) -->
        <div class="radar-card" style="background:linear-gradient(135deg, ${ov.color}15 0%, #ffffff 100%); border:1px solid ${ov.color}30; border-radius:20px; padding:32px; box-shadow:0 10px 30px -5px rgba(0,0,0,0.05); overflow:hidden; position:relative;">
            <div style="position:absolute; top:0; right:0; padding:24px; opacity:0.05; pointer-events:none;">
                <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="${ov.color}" stroke-width="1.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1.5fr 1fr; gap:40px; align-items:center;">
                <!-- FLEET HEALTH -->
                <div style="text-align:center; border-right:1px solid var(--border-light); padding-right:20px;">
                    <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px;">Operational Health</div>
                    <div style="font-size:64px; font-weight:900; color:${ov.color}; line-height:1; letter-spacing:-0.05em;">${ov.totalHealth}<span style="font-size:24px; opacity:0.5;">%</span></div>
                    <div style="display:inline-flex; align-items:center; gap:6px; margin-top:12px; background:${ov.color}20; color:${ov.color}; padding:4px 12px; border-radius:99px; font-size:12px; font-weight:800;">
                        <span style="width:8px; height:8px; border-radius:50%; background:${ov.color}; ${ov.status !== 'READY' ? 'animation:pulse-dot 2s infinite;' : ''}"></span>
                        ${ov.status}
                    </div>
                </div>

                <!-- TACTICAL REMARK -->
                <div>
                    <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">Safety Report</div>
                    <div style="background:#fff; border:1px solid var(--border-light); border-radius:12px; padding:20px; box-shadow:inset 0 2px 4px rgba(0,0,0,0.02);">
                        <p style="margin:0; font-family:monospace; font-size:14px; line-height:1.6; color:var(--text-main); font-weight:600;">
                            ${ov.remark}
                        </p>
                    </div>
                </div>

                <!-- QUICK STATS -->
                <div style="display:grid; grid-template-columns: 1fr; gap:12px;">
                    <div style="background:#fff; padding:12px 18px; border-radius:12px; border:1px solid var(--border-light); display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:12px; font-weight:700; color:var(--text-muted);">Risk Accounts</span>
                        <span style="font-size:16px; font-weight:800; color:var(--status-warn);">${ov.riskAccounts}</span>
                    </div>
                    <div style="background:#fff; padding:12px 18px; border-radius:12px; border:1px solid var(--border-light); display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:12px; font-weight:700; color:var(--text-muted);">Critical Accounts</span>
                        <span style="font-size:16px; font-weight:800; color:var(--status-error);">${ov.criticalAccounts}</span>
                    </div>
                    <div style="background:#fff; padding:12px 18px; border-radius:12px; border:1px solid var(--border-light); display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:12px; font-weight:700; color:var(--text-muted);">Training Phase</span>
                        <span style="font-size:16px; font-weight:800; color:var(--primary);">${(stats.accounts || []).filter(a => a.isTraining).length}</span>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- DASHBOARD CARDS -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;">
            <div class="card" style="padding:24px; border-top: 4px solid var(--primary);">
                <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Lifetime Sent</div>
                <div style="font-size: 32px; font-weight:900;">${_campaignStats.totalSent.toLocaleString()}</div>
            </div>
            <div class="card" style="padding:24px; border-top: 4px solid var(--status-ready);">
                <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Active Devices</div>
                <div style="font-size: 32px; font-weight:900;">${ov.activeDevicesCount}</div>
            </div>
            <div class="card" style="padding:24px; border-top: 4px solid var(--status-warn);">
                <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">Avg. Delivery Rate</div>
                <div style="font-size: 32px; font-weight:900;">${Math.round(ov.avgDeliveryRate || 0)}%</div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px;">
            <div class="card" style="padding:24px; display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h3 style="margin:0; font-weight:800; letter-spacing:-0.01em;">Operation Center</h3>
                    <span style="font-size:11px; font-weight:800; color:var(--primary); background:var(--primary-light); padding:4px 10px; border-radius:6px; text-transform:uppercase;">Live Feed</span>
                </div>
                <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
                    ${(stats.accounts || []).slice(0, 10).map((acc, idx) => `
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <div style="width:32px; height:32px; border-radius:50%; background:#fff; border:1px solid #e2e8f0; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:10px; color:var(--primary);">
                                    W${idx + 1}
                                </div>
                                <div>
                                    <div style="font-size:13px; font-weight:700; color:var(--text-main);">+${acc.number}</div>
                                </div>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:13px; font-weight:800; color:${acc.color};">${acc.healthScore}%</div>
                            </div>
                        </div>
                    `).join('') || `
                        <div style="height: 240px; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#94a3b8; border: 2px dashed #e2e8f0; border-radius: 16px; background: #f8fafc; gap:12px;">
                             <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5;"><path d="M12 20v-6M6 20V10M18 20V4"/></svg>
                            <div style="font-weight:700; color:var(--text-muted);">Initializing neural diagnostics...</div>
                        </div>
                    `}
                </div>
            </div>
            <div class="card" style="padding:24px;">
                <h3 style="margin:0 0 20px 0; font-weight:800; letter-spacing:-0.01em;">Quick Launch</h3>
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <button id="ql-campaign" class="btn-secondary" style="width:100%; padding:14px; text-align:left; display:flex; align-items:center; gap:12px; font-weight:700;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4.5c1.62-1.63 5-2.5 5-2.5"/><path d="M12 15v5c1.47 1.45 4.5 2 4.5 2s.87-3.38-1-5"/></svg>
                        Start New Campaign
                    </button>
                    <button id="ql-device" class="btn-secondary" style="width:100%; padding:14px; text-align:left; display:flex; align-items:center; gap:12px; font-weight:700;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                        Connect Device
                    </button>
                    <button id="ql-grabber" class="btn-secondary" style="width:100%; padding:14px; text-align:left; display:flex; align-items:center; gap:12px; font-weight:700;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        Grab Group Members
                    </button>
                    <div style="margin-top:12px; padding:16px; background:var(--primary-light); border-radius:12px; border:1px solid #dbeafe;">
                        <div style="font-size:12px; font-weight:800; color:var(--primary); text-transform:uppercase; margin-bottom:6px;">Titan Intelligence</div>
                        <p style="margin:0; font-size:12px; color:var(--text-main); font-weight:500; line-height:1.4;">Titan 3.0 is active. Message delivery patterns are being cross-referenced with account historical markers.</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `;

    // ATTENTION: Navigation Listeners (Module scope fix)
    container.querySelector('#ql-campaign').onclick = () => { activeTab = 'campaigns'; render(); }
    container.querySelector('#ql-device').onclick = () => { activeTab = 'devices'; render(); window.showPhoneModal(); }
    container.querySelector('#ql-grabber').onclick = () => { activeTab = 'grabber'; render(); }
}

function renderContacts(container) {
    if (container.firstElementChild) return
    container.innerHTML = `
    <div class="card" >
            <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                 <input type="text" placeholder="Search contacts..." style="padding:10px; border:1px solid #e2e8f0; border-radius:8px; width: 300px;">
                 <div style="display:flex; gap:10px;">
                    <button class="btn-secondary">Import CSV</button>
                    <button class="btn-primary">+ Add Contact</button>
                 </div>
            </div>
            <table class="industrial-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Tags</th>
                        <th>Last Seen</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td colspan="5" style="text-align:center; padding: 40px; color: #94a3b8;">
                            No contacts in Global Database yet. Import from extraction.
                        </td>
                    </tr>
                </tbody>
            </table>
        </div >
    `
}

function renderWarmer(container) {
    if (window.WarmerUI && !container.querySelector('.warmer-dashboard')) {
        window.WarmerUI.render(container);
    }
    if (!_warmerListenerSet) {
        _warmerListenerSet = true;
        window.api.onWarmerUpdate((state) => {
            _warmerState = state;
            if (window.WarmerUI) window.WarmerUI.update(state);
        });
        window.api.getWarmerState().then(s => {
            _warmerState = s;
            if (window.WarmerUI) window.WarmerUI.update(s);
        });
    }
    if (_warmerState && window.WarmerUI) {
        window.WarmerUI.update(_warmerState);
    }
}



function renderLaunchStep(leads) {
    const activeCamp = _activeCampaigns.get(_viewingCampaignId) || {}
    const isPaused = activeCamp.status === 'PAUSED'

    const total = leads.length
    const sent = leads.filter(l => l.status === 'SENT').length
    const failed = leads.filter(l => l.status === 'FAILED').length
    const pending = total - sent - failed
    const progress = total > 0 ? ((sent + failed) / total) * 100 : 0

    return `
    <div class="titan-canvas" >
        <div class="titan-container" style="padding: 32px; height:100%; display:flex; flex-direction:column; gap:24px;">

            <!-- HEADER & CONTROLS -->
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h2 style="margin:0 0 4px 0; font-size:24px; font-weight:800; color:var(--text-main); letter-spacing:-0.03em;">Campaign Execution Dashboard</h2>
                    <p style="color:var(--text-muted); margin:0; font-size:13px; font-weight:500;">Monitor real-time progress and worker efficiency.</p>
                </div>
                <div style="display:flex; gap:12px;">
                    <button id="campaign-pause-btn" class="titan-btn" style="padding:10px 20px; font-size:13px; font-weight:700; border-radius:10px; background:${isPaused ? '#22c55e' : '#fff'}; border:1px solid ${isPaused ? '#22c55e' : '#e2e8f0'}; color:${isPaused ? '#fff' : '#475569'};">
                        ${isPaused ? 'Resume Operation' : 'Pause Operation'}
                    </button>
                    <button id="campaign-stop-btn" class="titan-btn" style="padding:10px 20px; font-size:13px; font-weight:700; border-radius:10px; background:#fef2f2; border:1px solid #fee2e2; color:#ef4444;">
                        STOP ENGINE
                    </button>
                </div>
            </div>

            <!-- STATUS / COUNTDOWN BANNER -->
            ${isPaused ? `
            <div class="titan-card animate-pulse-soft" style="padding:16px; margin-bottom:0px; background:#fefce8; border:1px solid #fef08a; display:flex; align-items:center; justify-content:center; gap:20px; border-radius:16px;">
                <div style="font-size:28px;">⏸</div>
                <div style="text-align:left;">
                    <div style="font-size:14px; font-weight:800; color:#854d0e; text-transform:uppercase; letter-spacing:0.05em;">Campaign Paused</div>
                    <div style="font-size:12px; color:#a16207; font-weight:600;">Sending operation suspended. Click resume to continue.</div>
                </div>
            </div>
            ` : (activeCamp.waitState?.active && activeCamp.waitState?.until > Date.now() ? `
            <div class="titan-card animate-pulse-soft" style="padding:16px; margin-bottom:0px; background:${(activeCamp.waitState.details || '').includes('Sleep') ? '#fefce8' : '#eff6ff'}; border:1px solid ${(activeCamp.waitState.details || '').includes('Sleep') ? '#fef08a' : '#bfdbfe'}; display:flex; align-items:center; justify-content:center; gap:20px; border-radius:16px;">
                <div style="font-size:28px;">${(activeCamp.waitState.details || '').includes('Sleep') ? '😴' : '⏳'}</div>
                <div style="text-align:left;">
                    <div style="font-size:14px; font-weight:800; color:${(activeCamp.waitState.details || '').includes('Sleep') ? '#854d0e' : '#1e40af'}; text-transform:uppercase; letter-spacing:0.05em;">${activeCamp.waitState.details || 'Safety Protocol Active'}</div>
                    <div style="font-size:12px; color:${(activeCamp.waitState.details || '').includes('Sleep') ? '#a16207' : '#60a5fa'}; font-weight:600;">Simulating human behavior to protect your account.</div>
                </div>
                <div class="live-countdown" style="font-size:32px; font-weight:900; color:${(activeCamp.waitState.details || '').includes('Sleep') ? '#d97706' : '#2563eb'}; font-variant-numeric: tabular-nums; min-width:105px; text-align:right;">
                    ${Math.ceil((activeCamp.waitState.until - Date.now()) / 1000)}s
                </div>
            </div>
            ` : `
            <div class="titan-card" style="padding:12px 24px; background:#f8fafc; border:1px solid #e2e8f0; display:flex; align-items:center; gap:12px; border-radius:12px;">
                <div style="width:8px; height:8px; background:#22c55e; border-radius:50%; box-shadow:0 0 8px #22c55e;"></div>
                <div style="font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;">Titan Protection Active: Randomized Delays Enabled (${_userDelayMin}-${_userDelayMax}s)</div>
            </div>
            `)}

            <!-- STATS GRID -->
            <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:16px; margin-bottom:0px;">
                <div class="titan-card" style="padding:20px; text-align:center; border-bottom:3px solid var(--primary);">
                    <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Contacts</div>
                    <div style="font-size:24px; font-weight:900;" id="launch-stat-total">${total}</div>
                </div>
                <div class="titan-card" style="padding:20px; text-align:center; border-bottom:3px solid var(--status-ready);">
                    <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Sent</div>
                    <div style="font-size:24px; font-weight:900; color:var(--status-ready);" id="launch-stat-sent">${sent}</div>
                </div>
                <div class="titan-card" style="padding:20px; text-align:center; border-bottom:3px solid var(--titan-yellow);">
                    <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Pending</div>
                    <div style="font-size:24px; font-weight:900; color:var(--titan-yellow);" id="launch-stat-pending">${pending}</div>
                </div>
                <div class="titan-card" style="padding:20px; text-align:center; border-bottom:3px solid var(--status-error);">
                    <div style="font-size:11px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Failed</div>
                    <div style="font-size:24px; font-weight:900; color:var(--status-error);" id="launch-stat-failed">${failed}</div>
                </div>
            </div>

            <!-- PROGRESS BAR -->
            <div class="titan-card" style="padding:24px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:12px; align-items:center;">
                    <div style="font-weight:800; font-size:14px; color:var(--text-main);">Execution Progress</div>
                    <div style="font-weight:900; font-size:18px; color:var(--primary);" id="launch-progress-percent">${Math.round(progress)}%</div>
                </div>
                <div style="height:12px; background:#f1f5f9; border-radius:99px; overflow:hidden; border:1px solid var(--border-light);">
                    <div id="launch-progress-bar" style="height:100%; width:${progress}%; background:linear-gradient(90deg, var(--primary), #60a5fa); border-radius:99px; transition:width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);"></div>
                </div>
            </div>

            <!-- LIVE ACTIVITY FEED -->
            <div class="titan-card" style="flex:1; display:flex; flex-direction:column; overflow:hidden; padding:0;">
                <div style="padding:16px 24px; background:#f8fafc; border-bottom:1px solid var(--border-light); display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:800; font-size:12px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">Live Activity Feed</div>
                    <div style="font-size:10px; font-weight:700; color:var(--primary);">Real-time</div>
                </div>
                <div style="flex:1; overflow-y:auto; background:#fff;">
                    <table class="titan-table">
                        <thead>
                            <tr>
                                <th style="width:140px;">Phone</th>
                                <th style="width:160px;">Worker</th>
                                <th>Name</th>
                                <th style="width:120px;">Status</th>
                                <th style="text-align:right; width:120px;">Time</th>
                            </tr>
                        </thead>
                        <tbody id="launch-activity-body">
                            ${leads.filter(l => l.status === 'SENT' || l.status === 'FAILED')
                                   .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                                   .slice(0, 100)
                                   .map(l => `
                                <tr id="launch-row-${l.phone}" style="background:${l.status === 'SENT' ? '#f0fdf4' : (l.status === 'FAILED' ? '#fef2f2' : 'transparent')}; border-bottom: 1px solid #f1f5f9;">
                                    <td style="font-family:monospace; font-weight:700;">+${l.phone}</td>
                                    <td class="worker-cell" style="font-size:12px; font-weight:700; color:var(--primary); font-family:monospace;">${l.senderNumber ? `+${l.senderNumber}` : '-'}</td>
                                    <td style="color:var(--text-muted); font-weight:500;">${l.name || '-'}</td>
                                    <td>
                                        <span class="status-badge titan-badge-pill ${l.status === 'SENT' ? 'titan-badge-green' : (l.status === 'FAILED' ? 'titan-badge-red' : 'status-badge-pending')}" 
                                              style="background:${l.status === 'SENT' ? '#dcfce7' : (l.status === 'FAILED' ? '#fee2e2' : '#f1f5f9')}; 
                                                     color:${l.status === 'SENT' ? '#166534' : (l.status === 'FAILED' ? '#991b1b' : '#64748b')};">
                                            ${l.status || 'PENDING'}
                                        </span>
                                    </td>
                                    <td class="time-cell" style="text-align:right; font-size:11px; color:var(--text-muted);">${l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    </div >
    `
}

function setupWarmerListeners(pane) { }
