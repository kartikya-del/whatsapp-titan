const fs = require('fs');

function readAsarHeader(asarPath) {
    const fd = fs.openSync(asarPath, 'r');
    const sizeBuf = Buffer.alloc(8);
    fs.readSync(fd, sizeBuf, 0, 8, 0);

    // asar header has a size field
    // It's 4 bytes of 4, then 4 bytes of size.
    const headerSize = sizeBuf.readUInt32LE(4);
    console.log(`Header size: ${headerSize}`);

    const headerBuf = Buffer.alloc(headerSize);
    fs.readSync(fd, headerBuf, 0, headerSize, 8);
    fs.closeSync(fd);

    // Header is prefixed with another 4 bytes of size?
    // Actually it varies. Let's look at the first few bytes.
    let headerStr = headerBuf.toString('utf8');
    try {
        // Find the start of JSON
        const jsonStart = headerStr.indexOf('{');
        if (jsonStart !== -1) {
            const headerObj = JSON.parse(headerStr.substring(jsonStart));
            fs.writeFileSync('asar_header_1.0.10.json', JSON.stringify(headerObj, null, 2));
            console.log("Saved header to asar_header_1.0.10.json");
        } else {
            console.log("Could not find JSON start in header");
        }
    } catch (e) {
        console.error("Failed to parse header:", e.message);
        fs.writeFileSync('asar_header_raw.txt', headerStr);
    }
}

readAsarHeader('c:/Users/HP/Projects/whatsapp-extractor-ui/temp_extract_1010/resources/app.asar');
