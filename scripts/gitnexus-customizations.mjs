import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const customizationRoot = join(projectRoot, 'customizations', 'gitnexus');
const assets = ['ultraview.css', 'ultraview.js'];
const START = '<!-- ultraview:gitnexus-customizations -->';
const END = '<!-- /ultraview:gitnexus-customizations -->';

export function gitNexusCustomizationFingerprint() {
    const hash = createHash('sha256');
    hash.update(readFileSync(fileURLToPath(import.meta.url)));
    for (const asset of assets) hash.update(readFileSync(join(customizationRoot, asset)));
    return hash.digest('hex');
}

export function applyGitNexusCustomizations(webRoot) {
    for (const asset of assets) copyFileSync(join(customizationRoot, asset), join(webRoot, asset));

    const indexPath = join(webRoot, 'index.html');
    const original = readFileSync(indexPath, 'utf8');
    const markerPattern = new RegExp(`${START}[\\s\\S]*?${END}\\s*`, 'g');
    const clean = original
        .replace(markerPattern, '')
        // Ultraview supplies VS Code's own font stack, so the embedded UI does
        // not need to contact Google Fonts or keep those upstream preconnects.
        .replace(/\s*<link[^>]+href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/g, '\n    ');
    const injection = `${START}\n    <link rel="stylesheet" href="/ultraview.css">\n    <script defer src="/ultraview.js"></script>\n    ${END}\n  `;
    if (!clean.includes('</head>')) throw new Error('GitNexus web index has no </head>; Ultraview customization was not applied.');
    writeFileSync(indexPath, clean.replace('</head>', `${injection}</head>`));
}
