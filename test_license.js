const fetch = require('node-fetch');
const os = require('os');
const crypto = require('crypto');

const SUPABASE_URL = 'https://mhgqncwuronxrfozhhzd.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oZ3FuY3d1cm9ueHJmb3poaHpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM3MzI3MiwiZXhwIjoyMDg5OTQ5MjcyfQ.Lroyt2zstCFebBhudKoOMmIhw7CAri1TWhvy2kz0eGs';

// Generate HID
const raw = [os.platform(), os.release(), os.arch(), os.hostname(), os.cpus()[0]?.model || '', os.userInfo().username].join('|');
const hid = crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16).toUpperCase();
console.log('Your Hardware ID:', hid);

(async () => {
    // 1. Check existing keys
    console.log('\n=== EXISTING KEYS ===');
    const existing = await fetch(`${SUPABASE_URL}/rest/v1/titan_licenses?select=*`, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }
    });
    console.log(JSON.stringify(await existing.json(), null, 2));

    // 2. Insert a test key
    console.log('\n=== INSERTING TEST KEY ===');
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/titan_licenses`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Prefer': 'return=representation'
        },
        body: JSON.stringify({
            license_key: 'TITAN-1D-001',
            plan: 'PRO',
            valid_until: '2027-03-25T00:00:00Z',
            hardware_id: null
        })
    });
    console.log('Insert Status:', insertRes.status);
    console.log('Insert Response:', await insertRes.text());

    // 3. Test RPC validation
    console.log('\n=== TESTING RPC ===');
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/validate_titan_license`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`
        },
        body: JSON.stringify({ p_key: 'TITAN-1D-001', p_hardware: hid })
    });
    console.log('RPC Status:', rpcRes.status);
    console.log('RPC Response:', await rpcRes.text());
})();
