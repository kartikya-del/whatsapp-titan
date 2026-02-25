const fs = require('fs');

function extractFileFromAsar(asarPath, targetFilePath, outputPath) {
    const fd = fs.openSync(asarPath, 'r');
    const sizeBuf = Buffer.alloc(8);
    fs.readSync(fd, sizeBuf, 0, 8, 0);
    const headerSize = sizeBuf.readUInt32LE(4);

    const headerBuf = Buffer.alloc(headerSize);
    fs.readSync(fd, headerBuf, 0, headerSize, 8);

    let headerStr = headerBuf.toString('utf-8');
    const firstBrace = headerStr.indexOf('{');
    const lastBrace = headerStr.lastIndexOf('}');
    const jsonStr = headerStr.substring(firstBrace, lastBrace + 1);
    const header = JSON.parse(jsonStr);

    const parts = targetFilePath.split('/');
    let current = header;
    for (const part of parts) {
        if (current.files && current.files[part]) {
            current = current.files[part];
        } else {
            console.error(`Could not find ${part} in asar`);
            return;
        }
    }

    if (current.size && (current.offset !== undefined)) {
        const offset = BigInt(current.offset);
        const size = parseInt(current.size);
        const dataBuf = Buffer.alloc(size);
        const startPos = BigInt(8) + BigInt(headerSize) + offset;
        fs.readSync(fd, dataBuf, 0, size, startPos);
        fs.writeFileSync(outputPath, dataBuf);
        console.log(`Extracted ${targetFilePath} to ${outputPath} (${size} bytes)`);
    } else {
        console.error("Target is not a file with size/offset");
    }
    fs.closeSync(fd);
}

const asar1010 = 'c:/Users/HP/Projects/whatsapp-extractor-ui/temp_extract_1010/resources/app.asar';
extractFileFromAsar(asar1010, 'engine/ExtractionWorker.js', 'ExtractionWorker_1010.js');
extractFileFromAsar(asar1010, 'engine/ExtractionManager.js', 'ExtractionManager_1010.js');
extractFileFromAsar(asar1010, 'engine/CampaignManager.js', 'CampaignManager_1010.js');
extractFileFromAsar(asar1010, 'engine/AccountRegistry.js', 'AccountRegistry_1010.js');
extractFileFromAsar(asar1010, 'engine/LicenseManager.js', 'LicenseManager_1010.js');
extractFileFromAsar(asar1010, 'electron/preload.js', 'preload_1010.js');
