const fs = require('fs');
const path = 'c:/Users/Dannan/Documents/GitHub/Da3n0n/Ultraview/README.md';
let content = fs.readFileSync(path, 'utf8');
content = content.split('\n').filter(line => !line.trim().startsWith('<<<<<<<') && !line.trim().startsWith('=======') && !line.trim().startsWith('>>>>>>>')).join('\n');
fs.writeFileSync(path, content);
console.log('Cleanup complete');
