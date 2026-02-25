const fs = require("fs");
const path = require("path");

function deobfuscateFile(filePath) {

    let code = fs.readFileSync(filePath, "utf8");

    // remove anti-debug infinite loops
    code = code.replace(/while\s*\(\s*!!\[\]\s*\)\s*{[^}]*}/g, "");

    // remove debugger traps
    code = code.replace(/debugger;/g, "");

    // beautify basic structure
    const beautify = require("js-beautify").js;

    code = beautify(code, {
        indent_size: 2,
        space_in_empty_paren: true
    });

    fs.writeFileSync(filePath, code);

    console.log("Deobfuscated:", filePath);
}

function walk(dir) {

    const files = fs.readdirSync(dir);

    files.forEach(file => {

        const fullPath = path.join(dir, file);

        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        }
        else if (file.endsWith(".js")) {
            deobfuscateFile(fullPath);
        }

    });
}

walk("c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project");
