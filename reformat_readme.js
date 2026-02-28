const fs = require('fs');
const file = 'c:/Users/Dannan/Documents/GitHub/Da3n0n/Ultraview/README.md';
let content = fs.readFileSync(file, 'utf8');

let [head, ...rest] = content.split('## Cross-IDE Sync');
if (rest.length > 0) {
    // Replace the bold names with ### Headers
    head = head.replace(/^(.*?)\*\*([^\*]+)\*\*(.*?)$/gm, (match, before, inner, after) => {
        if (before.trim().length <= 4 && after.trim().length === 0) {
            return `### ${before.trim()} ${inner}`;
        }
        return match;
    });

    // Replace the description lines with <br>
    // A description line is one that doesn't start with # and isn't empty, inside the features section.
    head = head.replace(/^(?!#)(.+?\.)\s*$/gm, '$1<br>');

    content = head + '## Cross-IDE Sync' + rest.join('## Cross-IDE Sync');
    fs.writeFileSync(file, content);
    console.log("Updated features section in README.md");
} else {
    console.log("Could not find '## Cross-IDE Sync' boundary");
}
