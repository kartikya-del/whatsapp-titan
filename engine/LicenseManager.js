const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://wudukklipyetbawduphy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1ZHVra2xpcHlldGJhd2R1cGh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3OTU4MDQsImV4cCI6MjA4NzM3MTgwNH0.Fz2GI08uozRhcm60tWPmP3N0NZFb4N2So4LTEEQJCAs';

const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000; // 48 hours
const VALIDATE_COOLDOWN_MS = 3000; // 3 seconds

class LicenseManager {
    constructor(userDataPath) {
        this.configPath = path.join(userDataPath, 'license.json');
        this.licenseUrl = SUPABASE_URL;
        this.supabaseKey = SUPABASE_KEY;
        this._lastValidationAt = 0;

        this.state = {
            isValid: false,
            key: null,
            limits: null,
            validUntil: null,
            reason: 'No license found'
        };

        this._loadStoredLicense();
    }

    /**
     * Generates a unique hardware ID based on system information.
     */
    getHardwareId() {
        try {
            const networkInterfaces = os.networkInterfaces();
            const macAddresses = [];

            for (const name of Object.keys(networkInterfaces)) {
                for (const net of networkInterfaces[name]) {
                    if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
                        macAddresses.push(net.mac);
                    }
                }
            }

            const hardwareString = os.hostname() + '-' + os.platform() + '-' + macAddresses.sort().join(',');
            return crypto.createHash('sha256').update(hardwareString).digest('hex');
        } catch (error) {
            // Fallback for isolated environments
            return crypto.createHash('sha256').update(os.hostname() + os.arch()).digest('hex');
        }
    }

    /**
     * Generates an HMAC key for secure local storage of the license.
     */
    _getCacheSignatureKey() {
        const hardwareId = this.getHardwareId();
        const salt = ':titan-v3';
        return crypto.createHash('sha256').update(hardwareId + salt).digest();
    }

    /**
     * Signs a payload for secure local storage.
     */
    _signPayload(payload) {
        const hmacKey = this._getCacheSignatureKey();
        return crypto.createHmac('sha256', hmacKey)
            .update(JSON.stringify(payload))
            .digest('hex');
    }

    /**
     * Verifies if a stored payload is authentic.
     */
    _verifyPayload(payload, signature) {
        if (!signature || typeof signature !== 'string' || signature.length !== 64) return false;
        const expectedSignature = this._signPayload(payload);
        try {
            return crypto.timingSafeEqual(
                Buffer.from(signature, 'hex'),
                Buffer.from(expectedSignature, 'hex')
            );
        } catch {
            return false;
        }
    }

    /**
     * Checks if the local license is expired and handles enforcement.
     */
    _enforceLocalExpiry(licenseData) {
        if (!licenseData || !licenseData.valid_until) return true;

        const expiryTime = new Date(licenseData.valid_until).getTime();
        if (isNaN(expiryTime)) return true;

        if (expiryTime <= Date.now()) {
            console.log('[LICENSE] EXPIRED on ' + new Date(expiryTime).toLocaleString() + '. Deleting local cache.');
            try {
                if (fs.existsSync(this.configPath)) {
                    fs.unlinkSync(this.configPath);
                }
            } catch (err) { }

            this.state = {
                isValid: false,
                key: null,
                limits: null,
                validUntil: null,
                reason: 'License expired on ' + new Date(expiryTime).toLocaleString() + '.'
            };
            throw new Error('LICENSE_EXPIRED');
        }
        return true;
    }

    /**
     * Ensures the current license is valid before proceeding with protected actions.
     */
    ensureValidLicense() {
        if (!this.state.isValid || !this.state.key) {
            throw new Error('LICENSE_EXPIRED');
        }
        // Basic check for expiration even if disconnected
        this._enforceLocalExpiry({
            valid_until: this.state.validUntil,
            key: this.state.key
        });
    }

    /**
     * Loads the license from local storage and verifies its integrity.
     */
    _loadStoredLicense() {
        if (!fs.existsSync(this.configPath)) return;

        try {
            const content = fs.readFileSync(this.configPath, 'utf8');
            const data = JSON.parse(content);
            const { __sig: signature, ...licenseData } = data;

            if (!this._verifyPayload(licenseData, signature)) {
                console.log('[LICENSE] LOCAL SIGNATURE INVALID — Tampering detected. Deleting.');
                try {
                    fs.unlinkSync(this.configPath);
                } catch (err) { }
                return;
            }

            if (licenseData.key && licenseData.valid_until) {
                this._enforceLocalExpiry(licenseData);
                this.state.key = licenseData.key;
                this.state.limits = licenseData.limits;
                this.state.validUntil = licenseData.valid_until;
                this.state.isValid = true;
                this.state.reason = '';

                console.log('[LICENSE] Local cache verified for key: ' + licenseData.key.slice(0, 8) + '... Expires: ' + licenseData.valid_until);
            }
        } catch (error) {
            if (error.message === 'LICENSE_EXPIRED') throw error;
            console.error('[LICENSE] Failed to load stored license:', error.message);
            try {
                fs.unlinkSync(this.configPath);
            } catch (err) { }
        }
    }

    /**
     * Saves the license to local storage with a signature.
     */
    _saveLicense(key, limits, validUntil) {
        try {
            const payload = {
                key,
                limits,
                valid_until: validUntil,
                last_validated_timestamp: Date.now(),
                hardware_id: this.getHardwareId(),
                validatedAt: new Date().toISOString()
            };

            const signature = this._signPayload(payload);
            const dataToSave = { ...payload, __sig: signature };

            fs.writeFileSync(this.configPath, JSON.stringify(dataToSave, null, 2));
        } catch (error) {
            console.error('[LICENSE] Failed to save license cache:', error.message);
        }
    }

    /**
     * Deletes the local license cache.
     */
    resetLicenseCache() {
        try {
            if (fs.existsSync(this.configPath)) {
                fs.unlinkSync(this.configPath);
            }
            this.state = {
                isValid: false,
                key: null,
                limits: null,
                validUntil: null,
                reason: 'License reset.'
            };
            console.log('[LICENSE] License cache cleared.');
        } catch (error) {
            console.error('[LICENSE] Failed to delete license cache:', error.message);
        }
    }

    /**
     * Communicates with the Supabase backend via RPC.
     */
    async _supabaseRpc(functionName, params) {
        const response = await fetch(`${this.licenseUrl}/rest/v1/rpc/${functionName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': this.supabaseKey,
                'Authorization': `Bearer ${this.supabaseKey}`
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`[Supabase Error: ${functionName}] ${response.status}: ${errorText}`);
        }

        return response.json();
    }

    /**
     * Validates a license key with the server.
     */
    async validate(licenseKey) {
        const now = Date.now();
        if (now - this._lastValidationAt < VALIDATE_COOLDOWN_MS) {
            return {
                success: false,
                reason: 'Too many attempts. Please wait a moment.'
            };
        }
        this._lastValidationAt = now;

        const hardwareId = this.getHardwareId();
        console.log('[LICENSE] Validating key: ' + licenseKey?.slice(0, 8) + '... Hardware: ' + hardwareId.slice(0, 16));

        try {
            const result = await this._supabaseRpc('validate_license', {
                input_key: licenseKey,
                input_hardware_id: hardwareId
            });

            // Handle server returning "true" as string or boolean
            if (result.valid === true || result.valid === 'true') {
                const limits = result.limits || {};
                const validUntil = result.license?.valid_until || null;

                this.state = {
                    isValid: true,
                    key: licenseKey,
                    limits: limits,
                    validUntil: validUntil,
                    reason: ''
                };

                this._saveLicense(licenseKey, limits, validUntil);
                console.log('[LICENSE] Validation successful. Plan: ' + (limits.plan_type || 'PLAN'));

                return {
                    success: true,
                    limits: limits
                };
            } else {
                this.state.isValid = false;
                this.state.reason = result.reason || 'License is invalid for this hardware or has expired.';
                console.log('[LICENSE] Validation DENIED: ' + this.state.reason);
                return {
                    success: false,
                    reason: this.state.reason
                };
            }
        } catch (error) {
            console.error('[LICENSE] Validation network/server error:', error.message);
            return this._handleOfflineGrace(licenseKey);
        }
    }

    /**
     * Periodically check license status in the background.
     */
    async silentValidate() {
        if (!this.state.key) {
            return { success: false, reason: 'No license key stored.' };
        }

        // If expired, lock immediately
        if (this.state.validUntil && new Date(this.state.validUntil) <= new Date()) {
            const formatted = new Date(this.state.validUntil).toLocaleString();
            this.state.isValid = false;
            this.state.reason = 'License expired on ' + formatted + '.';
            console.log('[LICENSE] Heartbeat detected expiry (' + formatted + '). Locking.');
            return { success: false, reason: this.state.reason };
        }

        const hardwareId = this.getHardwareId();
        try {
            const result = await this._supabaseRpc('validate_license', {
                input_key: this.state.key,
                input_hardware_id: hardwareId
            });

            if (result.valid === true || result.valid === 'true') {
                const validUntil = result.valid_until || this.state.validUntil;
                const limits = result.limits || this.state.limits;

                this.state.isValid = true;
                this.state.validUntil = validUntil;
                this.state.limits = limits;
                this.state.reason = '';

                this._saveLicense(this.state.key, validUntil, limits);
                return { success: true, key: validUntil };
            } else {
                this.state.isValid = false;
                this.state.reason = result.reason || 'Invalid license detected.';
                console.warn('[LICENSE] Background heartbeat check DENIED: ' + this.state.reason);
                return { success: false, reason: this.state.reason };
            }
        } catch (error) {
            console.error('[LICENSE] Heartbeat check failed:', error.message);
            return this._handleOfflineGrace(this.state.key);
        }
    }

    /**
     * Handles license verification when offline, using local cache and grace periods.
     */
    _handleOfflineGrace(licenseKey) {
        if (!fs.existsSync(this.configPath)) {
            return {
                success: false,
                reason: 'Service unreachable and no cached license found.'
            };
        }

        try {
            const content = fs.readFileSync(this.configPath, 'utf8');
            const data = JSON.parse(content);
            const { __sig: signature, ...licenseData } = data;

            if (!this._verifyPayload(licenseData, signature)) {
                return {
                    success: false,
                    reason: 'Tamper-protection error or invalid local cache.'
                };
            }

            const keyMatch = licenseData.key === licenseKey;
            const hidMatch = licenseData.hardware_id === this.getHardwareId();
            const lastValidated = licenseData.last_validated_timestamp || 0;
            const withinGrace = (Date.now() - lastValidated) < GRACE_PERIOD_MS;
            const notExpiredLocally = !licenseData.valid_until || new Date(licenseData.valid_until) > new Date();

            if (keyMatch && hidMatch && withinGrace && notExpiredLocally) {
                this.state.isValid = true;
                this.state.key = licenseData.key;
                this.state.validUntil = licenseData.valid_until;
                this.state.limits = licenseData.limits;
                this.state.reason = 'OFFLINE_GRACE';

                console.log('[LICENSE] Offline grace period allowed. Reconnect soon.');
                return {
                    success: true,
                    limits: licenseData.limits,
                    isOffline: true
                };
            }

            const reason = !keyMatch ? 'Key mismatch.' :
                !hidMatch ? 'Hardware ID mismatch.' :
                    !withinGrace ? 'Offline grace period expired. Reconnect required.' :
                        'Local cache expired.';

            console.log('[LICENSE] OFFLINE VALIDATION DENIED: ' + reason);
            this.state.isValid = false;
            this.state.reason = reason;
            return { success: false, reason: reason };
        } catch (error) {
            return {
                success: false,
                reason: 'Offline validation failed: ' + error.message
            };
        }
    }

    /**
     * Requests a free trial from the server.
     */
    async startFreeTrial() {
        const now = Date.now();
        if (now - this._lastValidationAt < VALIDATE_COOLDOWN_MS) {
            return { success: false, reason: 'Too many attempts. Please wait.' };
        }
        this._lastValidationAt = now;

        const hardwareId = this.getHardwareId();
        console.log('[LICENSE] Starting trial for Hardware: ' + hardwareId.slice(0, 16));

        try {
            const result = await this._supabaseRpc('start_trial_by_hardware', {
                input_hardware_id: hardwareId
            });

            if (result.success === true || result.success === 'true') {
                const trialKey = result.key;
                const limits = result.limits || {
                    daily_send_limit: 25,
                    daily_extract_limit: 100,
                    plan_type: 'trial',
                    valid_until: result.valid_until
                };

                this.state = {
                    isValid: true,
                    key: trialKey,
                    limits: limits,
                    validUntil: result.valid_until || null,
                    reason: ''
                };

                this._saveLicense(trialKey, limits, result.valid_until || null);
                console.log('[LICENSE] Trial started. Key: ' + trialKey?.slice(0, 8));

                return {
                    success: true,
                    limits: limits,
                    key: trialKey
                };
            } else {
                const reason = result.reason || 'Trial not available for this hardware.';
                console.log('[LICENSE] Trial denied: ' + reason);
                return { success: false, reason: reason };
            }
        } catch (error) {
            console.error('[LICENSE] Trial request error:', error.message);
            return {
                success: false,
                reason: 'Trial request failed: ' + error.message
            };
        }
    }

    /**
     * Gets license expiration information for the UI.
     */
    getExpiryInfo() {
        const validUntil = this.state.validUntil;
        if (!validUntil) return { hasExpiry: false, daysLeft: null, expired: false };

        const expiryDate = new Date(validUntil);
        const diff = expiryDate - new Date();
        const daysLeft = Math.floor(diff / (1000 * 60 * 60 * 24));

        return {
            hasExpiry: true,
            daysLeft: Math.max(0, daysLeft),
            expiryDate: expiryDate.toISOString(),
            expiryFormatted: expiryDate.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            expired: diff <= 0,
            expiredAt: diff <= 0 ? expiryDate.toLocaleString() : null
        };
    }

    /**
     * Gets current usage statistics from the server.
     */
    async getUsage() {
        if (!this.state.key) return { messages_sent: 0, contacts_extracted: 0 };

        try {
            const stats = await this._supabaseRpc('get_usage_today', {
                input_key: this.state.key,
                input_hardware_id: this.getHardwareId()
            });

            return {
                messages_sent: stats.messages_sent || 0,
                contacts_extracted: stats.contacts_extracted || 0
            };
        } catch (err) {
            console.error('[LICENSE] getUsage failed:', err.message);
            return { messages_sent: 0, contacts_extracted: 0 };
        }
    }

    /**
     * Increments usage count (locally or on server).
     */
    async incrementUsage(type, amount = 1) {
        if (!this.state.key) return;

        try {
            await this._supabaseRpc('increment_usage', {
                input_key: this.state.key,
                input_hardware_id: this.getHardwareId(),
                increment_extract: (type === 'extract' || type === 'contacts') ? amount : 0,
                increment_messages: (type === 'message' || type === 'send') ? amount : 0
            });
        } catch (err) {
            console.error('[LICENSE] incrementUsage failed:', err.message);
        }
    }

    /**
     * Checks if a specific action is within the license limits.
     */
    async checkLimit(type) {
        if (!this.state.isValid) {
            return { allowed: false, reason: 'No valid license.' };
        }

        const limits = this.state.limits || {};
        // If limits are not defined, assume unlimited
        if (!limits.daily_send_limit && !limits.daily_extract_limit) {
            return { allowed: true };
        }

        try {
            const usage = await this.getUsage();

            if (type === 'message' || type === 'send') {
                const limit = limits.daily_send_limit || 0;
                if (limit > 0 && usage.messages_sent >= limit) {
                    return {
                        allowed: false,
                        reason: `Daily message limit reached (${usage.messages_sent}/${limit}). Resets at midnight.`
                    };
                }
            }

            if (type === 'extraction' || type === 'extract') {
                const limit = limits.daily_extract_limit || 0;
                if (limit > 0 && usage.contacts_extracted >= limit) {
                    return {
                        allowed: false,
                        reason: `Daily extraction limit reached (${usage.contacts_extracted}/${limit}). Resets at midnight.`
                    };
                }
            }

            return { allowed: true };
        } catch (err) {
            console.error('[LICENSE] checkLimit error:', err.message);
            return { allowed: true }; // Allow on error to avoid blocking users
        }
    }

    /**
     * Returns the current state and hardware ID.
     */
    getStatus() {
        // Final sanity check for expiration
        if (this.state.isValid && this.state.validUntil) {
            if (new Date(this.state.validUntil) <= new Date()) {
                const formatted = new Date(this.state.validUntil).toLocaleString();
                this.state.isValid = false;
                this.state.reason = 'License expired on ' + formatted + '.';
                console.warn('[LICENSE] status check detected expiry (' + formatted + ').');
            }
        }

        return {
            ...this.state,
            hid: this.getHardwareId()
        };
    }
}

module.exports = LicenseManager;