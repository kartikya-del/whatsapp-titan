const { spawn } = require('child_process');
const path = require('path');

console.log("🚀 STARTING FULL SYSTEM EDGE CASE VALIDATION\n");

const runScript = (scriptName) => {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, scriptName);
        console.log(`\n▶ EXECUTING: ${scriptName}`);
        console.log("---------------------------------------------------");

        const proc = spawn('node', [scriptPath], { stdio: 'inherit' });

        proc.on('close', (code) => {
            console.log("---------------------------------------------------");
            if (code === 0) {
                console.log(`✅ ${scriptName} PASSED`);
                resolve();
            } else {
                console.error(`❌ ${scriptName} FAILED (Exit Code: ${code})`);
                reject(new Error(`Script failed: ${scriptName}`));
            }
        });
    });
};

const main = async () => {
    try {
        await runScript('all_sending_features_test.js');
        await runScript('campaign_management_test.js');

        console.log("\n===================================================");
        console.log("🎉 ALL SYSTEMS GO: CORE LOGIC & UI DATA MODEL VERIFIED");
        console.log("===================================================");
    } catch (err) {
        console.error("\n💥 SYSTEM VALIDATION FAILED");
        process.exit(1);
    }
};

main();
