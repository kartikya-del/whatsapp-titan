const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class LicenseManager {
    constructor(userDataPath) {
        this.configPath = path.join(userDataPath, 'license.json');
        this.state = {
            isValid: true,
            key: 'TITAN-UNLEASHED-DEV',
            limits: {
                message: 999999,
                extraction: 999999
            },
            validUntil: '2099-12-31T23:59:59Z',
            reason: 'Development Mode Active'
        };
    }

    getHardwareId() {
        return 'TITAN-DEV-HID';
    }

    async validate(licenseKey) {
        return { success: true };
    }

    async silentValidate() {
        return { success: true };
    }

    async startFreeTrial() {
        return { success: true };
    }

    // Required by 1.0.11 Warmer/Main logic
    ensureValidLicense() {
        return true;
    }

    // Support for usage tracking if called
    async incrementUsage(type, count) {
        return true;
    }

    // Support for limit checks if called
    async checkLimit(type) {
        return { allowed: true };
    }

    // Support for warmer limit checks
    async checkTrialLimit(type) {
        return { allowed: true };
    }

    getStatus() {
        return { ...this.state, hid: this.getHardwareId() };
    }

    deleteLicenseCache() {
        if (fs.existsSync(this.configPath)) fs.unlinkSync(this.configPath);
    }
}

module.exports = LicenseManager;
