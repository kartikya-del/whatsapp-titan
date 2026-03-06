const fs = require('fs')
const path = require('path')

const DAILY_LIMIT = 10000000

class AccountRegistry {
    constructor({ accountsDir, logsDir }) {
        this.accountsDir = accountsDir
        this.logsDir = logsDir
        this.accounts = new Map()
        this.usageFile = path.join(this.logsDir, 'daily_usage.json')

        if (!fs.existsSync(this.accountsDir)) {
            fs.mkdirSync(this.accountsDir, { recursive: true })
        }
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true })
        }

        this._loadAccounts()
        this._loadUsage()
    }

    _loadAccounts() {
        if (!fs.existsSync(this.accountsDir)) return

        const folders = fs.readdirSync(this.accountsDir)
        console.log(`[REGISTRY] 🔍 Scanning for existing accounts...`)

        for (const folder of folders) {
            if (!folder.startsWith('session-account_')) continue

            const number = folder.replace('session-account_', '')
            console.log(`[REGISTRY] ✅ Found account: ${number}`)

            this.accounts.set(number, {
                number,
                sessionPath: path.join(this.accountsDir, folder),
                extracting: false,
                todayCount: 0,
                lastDate: this._today(),
                extractionState: null
            })

            this._cleanupLockFiles(number)
        }

        console.log(`[REGISTRY] 📊 Loaded ${this.accounts.size} account(s)`)
    }

    _loadUsage() {
        if (!fs.existsSync(this.usageFile)) return
        try {
            const raw = JSON.parse(fs.readFileSync(this.usageFile, 'utf8'))
            const today = this._today()

            for (const number of Object.keys(raw)) {
                const acc = this.accounts.get(number)
                if (!acc) continue
                acc.todayCount = raw[number][today] || 0
                acc.lastDate = today
            }
        } catch (e) { }
    }

    _persistUsage() {
        const today = this._today()
        const data = {}
        for (const acc of this.accounts.values()) {
            data[acc.number] = { [today]: acc.todayCount }
        }
        fs.writeFileSync(this.usageFile, JSON.stringify(data, null, 2))
    }

    _today() { return new Date().toISOString().slice(0, 10); }

    _ensureDate(account) {
        const today = this._today()
        if (account.lastDate !== today) {
            account.todayCount = 0
            account.lastDate = today
        }
    }

    _cleanupLockFiles(number) {
        const acc = this.accounts.get(number)
        if (!acc || !acc.sessionPath) return
        const lockFiles = [
            path.join(acc.sessionPath, 'Default', 'SingletonLock'),
            path.join(acc.sessionPath, 'SingletonLock'),
            path.join(acc.sessionPath, 'Default', 'lockfile'),
            path.join(acc.sessionPath, 'lockfile')
        ]
        lockFiles.forEach(f => {
            if (fs.existsSync(f)) { try { fs.unlinkSync(f) } catch (e) { } }
        })
    }

    listAccounts() {
        return Array.from(this.accounts.values()).map(a => ({
            number: a.number,
            extracting: a.extracting,
            todayCount: a.todayCount
        }))
    }

    getAccount(number) {
        const acc = this.accounts.get(number)
        if (!acc) throw new Error(`Account not found: ${number}`)
        this._ensureDate(acc)
        return acc
    }

    createSession(number) {
        const sessionPath = path.join(this.accountsDir, `session-account_${number}`)
        if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true })
        this.accounts.set(number, {
            number,
            sessionPath,
            extracting: false,
            todayCount: 0,
            lastDate: this._today(),
            extractionState: null
        })
        return sessionPath
    }

    saveExtractionState(number, state) {
        const acc = this.getAccount(number)
        acc.extractionState = state
        const stateFile = path.join(acc.sessionPath, 'extraction_state.json')
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2))
    }

    deleteAccount(number) {
        const acc = this.accounts.get(number)
        if (!acc) return
        if (fs.existsSync(acc.sessionPath)) {
            try { fs.rmSync(acc.sessionPath, { recursive: true, force: true }) } catch (e) { }
        }
        this.accounts.delete(number)
        this._persistUsage()
        return true
    }

    getExtractionState(number) {
        const acc = this.getAccount(number)
        const stateFile = path.join(acc.sessionPath, 'extraction_state.json')
        if (fs.existsSync(stateFile)) {
            acc.extractionState = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
            return acc.extractionState
        }
        return null
    }

    clearExtractionState(number) {
        const acc = this.getAccount(number)
        acc.extractionState = null
        const stateFile = path.join(acc.sessionPath, 'extraction_state.json')
        if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile)
    }

    canConsume(number, count) {
        const acc = this.getAccount(number)
        this._ensureDate(acc)
        return acc.todayCount + count <= DAILY_LIMIT
    }

    consume(number, count) {
        const acc = this.getAccount(number)
        this._ensureDate(acc)
        acc.todayCount += count
        this._persistUsage()
    }

    resetUsage(number) {
        const acc = this.accounts.get(number)
        if (acc) {
            acc.todayCount = 0;
            this._persistUsage();
        }
    }
}

module.exports = AccountRegistry
