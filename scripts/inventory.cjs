const fs = require('fs');
const path = require('path');

const ignore = new Set(['.git', '__pycache__', '.venv', 'node_modules', '.vs', 'dist', 'build', '.next']);
const skipFiles = new Set(['inventory_dbl-chat-client.md', 'package-lock.json']);
const binaryExt = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.sqlite', '.db', '.whl', '.svg']);

const treeLines = [];
const fileContents = [];

function walk(dir, level = 0) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const indent = '  '.repeat(level);
    const folder = path.basename(dir) || '.';
    treeLines.push(indent + folder + '/');

    const subindent = '  '.repeat(level + 1);
    const dirs = entries.filter(e => e.isDirectory() && !ignore.has(e.name) && !e.name.endsWith('.egg-info')).sort((a, b) => a.name.localeCompare(b.name));
    const files = entries.filter(e => e.isFile() && !skipFiles.has(e.name) && !e.name.startsWith('inventory_')).sort((a, b) => a.name.localeCompare(b.name));

    for (const f of files) {
        const filePath = path.join(dir, f.name);
        treeLines.push(subindent + f.name);

        const ext = path.extname(f.name).toLowerCase();
        if (binaryExt.has(ext)) {
            fileContents.push([filePath.replace(/\\/g, '/'), 'BINARY (omitted)', null]);
        } else {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                if (content.length > 200000) {
                    fileContents.push([filePath.replace(/\\/g, '/'), 'OMITTED (too large)', null]);
                } else {
                    fileContents.push([filePath.replace(/\\/g, '/'), null, content]);
                }
            } catch (e) {
                fileContents.push([filePath.replace(/\\/g, '/'), 'UNREADABLE', null]);
            }
        }
    }

    for (const d of dirs) {
        walk(path.join(dir, d.name), level + 1);
    }
}

walk('.');

const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
let output = `# Inventory: dbl-chat-client\nGenerated: ${timestamp}\n\n## File Tree\n\`\`\`\n`;
output += treeLines.join('\n');
output += '\n```\n\n## File Contents\n\n';

for (const [filePath, status, content] of fileContents) {
    output += `### ${filePath}\n`;
    if (status) {
        output += `\`${status}\`\n`;
    } else {
        const ext = path.extname(filePath).slice(1) || 'text';
        output += '```' + ext + '\n';
        output += content;
        output += '\n```\n';
    }
    output += '\n';
}

fs.writeFileSync('inventory_dbl-chat-client.md', output);
console.log('Inventory created:', fileContents.length, 'files');
