const fs = require('fs');

const filePath = 'c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/ExtractionWorker_final.js';
let content = fs.readFileSync(filePath, 'utf8');

let finalContent = content;

// 1. Resolve remaining strings and property access
finalContent = finalContent.replace(/\['([^']+)'\]/g, ".$1"); // worker['client'] -> worker.client
finalContent = finalContent.replace(/\["([^"]+)"\]/g, ".$1"); // worker["client"] -> worker.client

// 2. Fix the split string requires and calls
finalContent = finalContent.replace(/'\s*\+\s*'/g, ""); // 'a' + 'b' -> 'ab'
finalContent = finalContent.replace(/\.\s+'([^']+)'/g, ".$1"); // obj. 'prop' -> obj.prop
finalContent = finalContent.replace(/\[\s*'([^']+)'\s*\]/g, ".$1"); // Fix missed ones

// 3. Remove the decoder aliases and junk headers that might have survived
finalContent = finalContent.replace(/const d = _0x26b4d5;/g, "");
finalContent = finalContent.replace(/const d = decoder;/g, "");
finalContent = finalContent.replace(/const d = d;/g, "");

// 4. Resolve the /* string resolved */ comments if they are next to accessors
finalContent = finalContent.replace(/\/\* string resolved \*\/\s*\+\s*/g, "");
// This is risky, let's just clean up the property access logic
finalContent = finalContent.replace(/this\ \/\* string resolved \*\//g, "this");

// 5. Semantic property cleanup
// Looking at lines like: this[/* string resolved */ + 'ctsCache'] = []
// We know from context this is contactsCache or similar.
// But the tool already renamed many. Let's fix the remaining manual ones.
finalContent = finalContent.replace(/this\.setAutoReplySettings/g, "setAutoReplySettings"); // class methods

// 6. Fix class method definitions (the .method syntax)
finalContent = finalContent.replace(/class ExtractionWorker extends EventEmitter \{[\s\S]*?constructor/g, (match) => {
    return match;
});

// Class methods are often like:   } .setAutoReplySettings(_0xa45af3) {
finalContent = finalContent.replace(/\}\s*\.\s*([a-zA-Z0-9_$]+)/g, "} $1");

// 7. Final pass on false/true
finalContent = finalContent.replace(/!false/g, "true");
finalContent = finalContent.replace(/!true/g, "false");

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project/engine/ExtractionWorker_ultimate.js', finalContent);
console.log("Created ExtractionWorker_ultimate.js");
