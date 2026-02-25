const fetch = require('node-fetch'); // Using node-fetch to be safe if node < 18

const SUPABASE_URL = 'https://vdudduvduuphy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkdWRkdXZkdXVwaHkiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTczOTU4MzEzMSwiZXhwIjoyMDU1MTU5MTMxfQ.Fz2Z_8S_hH-eW_fIs_lB-mJ_kHJCAs';

async function testConnection() {
    console.log('Testing connection to Supabase...');
    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/validate_license`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            },
            body: JSON.stringify({
                input_key: 'TEST',
                input_hardware_id: 'TEST'
            })
        });

        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Response:', text);
    } catch (err) {
        console.error('Connection failed:', err.message);
    }
}

testConnection();
