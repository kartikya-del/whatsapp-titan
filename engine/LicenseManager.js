const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

class LicenseManager {
    constructor(userDataPath) {
        this.configPath = path.join(userDataPath, 'license.json');
        this.baseUrl = 'https://mhgqncwuronxrfozhhzd.supabase.co';
        this.apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZ3FuY3d1cm9ueHJmb3poaHpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM3MzI3MiwiZXhwIjoyMDg5OTQ5MjcyfQ.Lroyt2zstCFebBhudKoOMmIhw7CAri1TWhvy2kz0eGs';
        this.state = this._load();
    }

    _load() {
        try {
            if (fs.existsSync(this.configPath))
                return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        } catch {}
        return { key: null, isValid: false };
    }

    _save(data) {
        this.state = { ...this.state, ...data };
        fs.writeFileSync(this.configPath, JSON.stringify(this.state, null, 2));
    }

    getHardwareId() {
        const raw = [
            os.platform(), os.release(), os.arch(),
            os.hostname(), os.cpus()[0]?.model || '',
            os.userInfo().username
        ].join('|');
        return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16).toUpperCase();
    }

    async validate(key) {
        const hid = this.getHardwareId();
        console.log(`[LICENSE] Validating key=${key} hid=${hid}`);
        try {
            const res = await fetch(`${this.baseUrl}/rest/v1/rpc/validate_titan_license`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': this.apiKey,
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({ p_key: key, p_hardware: hid })
            });

            if (!res.ok) {
                console.error(`[LICENSE] Server ${res.status}:`, await res.text());
                return { success: false, reason: 'License server error' };
            }

            const raw = await res.json();
            const data = Array.isArray(raw) ? raw[0] : raw;
            console.log('[LICENSE] Response:', data);

            if (!data || !data.status) return { success: false, reason: 'Invalid server response' };

            if (data.status === 'activated' || data.status === 'ok') {
                if (data.valid_until && new Date(data.valid_until) < new Date()) {
                    console.warn(`[LICENSE] Key technically ok on server but valid_until (${data.valid_until}) has passed.`);
                    this._save({ isValid: false, key: null, plan: null, validUntil: null });
                    return { success: false, reason: 'License expired' };
                }
                this._save({ key, isValid: true, hid, plan: data.plan || 'PRO', validUntil: data.valid_until || null });
                return { success: true };
            }
            if (data.status === 'expired') {
                this._save({ isValid: false, key: null, plan: null, validUntil: null });
                return { success: false, reason: 'License expired' };
            }
            if (data.status === 'device_mismatch') {
                this._save({ isValid: false, key: null, plan: null, validUntil: null });
                return { success: false, reason: 'Key already used on another device' };
            }
            
            this._save({ isValid: false, key: null, plan: null, validUntil: null });
            return { success: false, reason: data.message || 'Invalid license key' };

        } catch (e) {
            console.error('[LICENSE] Network error:', e.message);
            return { success: false, reason: 'Network error. Check your internet.' };
        }
    }

    async silentValidate() {
        if (!this.state.key) return { success: false, reason: 'No license key stored.' };
        return this.validate(this.state.key);
    }

    async startFreeTrial() {
        const hid = this.getHardwareId();
        console.log(`[LICENSE] Attempting to start free trial for hardware: ${hid}`);
        try {
            // 1. Check if ANY key (Trial or PRO) has ever been attached to this hardware
            const checkRes = await fetch(`${this.baseUrl}/rest/v1/titan_licenses?hardware_id=eq.${hid}&select=id`, {
                headers: {
                    'apikey': this.apiKey,
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            if (!checkRes.ok) return { success: false, reason: 'Could not connect to license server.' };

            const existing = await checkRes.json();
            if (existing && existing.length > 0) {
                return { success: false, reason: 'A free trial has already been used on this device.' };
            }

            // 2. Generate a trial key and expiry date
            const trialKey = 'TRIAL-' + crypto.randomBytes(4).toString('hex').toUpperCase();
            const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

            // 3. Insert into titan_licenses
            const insertRes = await fetch(`${this.baseUrl}/rest/v1/titan_licenses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': this.apiKey,
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    license_key: trialKey,
                    plan: 'trial',
                    valid_until: validUntil,
                    hardware_id: hid
                })
            });

            if (!insertRes.ok) return { success: false, reason: 'Failed to provision free trial.' };

            // 4. Save and return success
            this._save({
                key: trialKey,
                isValid: true,
                hid,
                plan: 'trial',
                validUntil: validUntil
            });

            return { success: true, key: trialKey, limits: { plan_type: 'TRIAL', days: 7 } };

        } catch (e) {
            console.error('[LICENSE] Trial Error:', e.message);
            return { success: false, reason: 'Network error. Trial activation failed.' };
        }
    }

    ensureValidLicense() {
        if (!this.state.isValid) throw new Error('License required');
        return true;
    }

    getExpiryInfo() {
        if (!this.state.validUntil) return { hasExpiry: false };
        const expiry = new Date(this.state.validUntil);
        const diff = expiry - new Date();
        return {
            hasExpiry: true,
            expired: diff <= 0,
            daysLeft: Math.ceil(diff / (1000 * 60 * 60 * 24)),
            expiryFormatted: expiry.toLocaleDateString()
        };
    }

    getStatus() {
        return {
            isValid: this.state.isValid,
            key: this.state.key,
            plan: this.state.plan || null,
            validUntil: this.state.validUntil || null,
            hid: this.getHardwareId()
        };
    }
}

module.exports = LicenseManager;
