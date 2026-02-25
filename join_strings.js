const fs = require('fs');
let content = fs.readFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-final/engine/ExtractionWorker.js', 'utf8');

// 1. Join split string literals across newlines
// Pattern: 'abc \n def'
content = content.replace(/'\s*\n\s*/g, "'");
content = content.replace(/"\s*\n\s*/g, '"');

// 2. Join bracket property access that are split: identifier \n ['prop']
content = content.replace(/(\w+)\s*\n\s*\[/g, '$1[');

// 3. Join logic that's split by newlines but should be continuous
// This is harder. Let's look at the patterns.
// example: 
// number ':this['
// number '],'
// becomes number: this.number,

// Let's handle the specific broken strings in this file.
// It seems many identifiers are broken like 'getMod' \n 'elsArr' \n 'ay'
content = content.replace(/'\s*['"]/g, ''); // 'abc''def' -> 'abcdef' (happens if quotes were adjacent)
// But wait, the previous regexes for strings should have handled it if there was a newline.

// Let's try a simpler approach: remove newlines that are between a quote and another quote OR between a bracket and a quote.
// NOT generically, but where it makes sense.

// Actually, let's just join EVERYTHING that looks like a split string.
content = content.replace(/['"]\s*\n\s*['"]/g, '');

fs.writeFileSync('c:/Users/HP/Projects/whatsapp-extractor-ui/recovered-project-final/engine/ExtractionWorker.js', content);
console.log("Joined split strings in ExtractionWorker.js");
