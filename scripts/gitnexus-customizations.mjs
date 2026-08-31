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

export function applyGitNexusCustomizations(webRoot, fingerprint) {
    const assetVersion = fingerprint.slice(0, 16);
    const stylesheet = `ultraview-${assetVersion}.css`;
    const script = `ultraview-${assetVersion}.js`;
    copyFileSync(join(customizationRoot, 'ultraview.css'), join(webRoot, stylesheet));
    copyFileSync(join(customizationRoot, 'ultraview.js'), join(webRoot, script));

    const indexPath = join(webRoot, 'index.html');
    const original = readFileSync(indexPath, 'utf8');
    const markerPattern = new RegExp(`${START}[\\s\\S]*?${END}\\s*`, 'g');
    const clean = original
        .replace(markerPattern, '')
        // Ultraview supplies VS Code's own font stack, so the embedded UI does
        // not need to contact Google Fonts or keep those upstream preconnects.
        .replace(/\s*<link[^>]+href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/g, '\n    ');
    const injection = `${START}\n    <link rel="stylesheet" href="/${stylesheet}">\n    <script defer src="/${script}"></script>\n    ${END}\n  `;
    if (!clean.includes('</head>')) throw new Error('GitNexus web index has no </head>; Ultraview customization was not applied.');
    writeFileSync(indexPath, clean.replace('</head>', `${injection}</head>`));
}

/**
 * Apply small runtime compatibility fixes to the staged GitNexus package.
 * The vendored checkout stays pristine so it can continue to receive upstream
 * updates without carrying an Ultraview-only source patch.
 */
export function applyGitNexusRuntimeCustomizations(packageRoot) {
    const configPath = join(packageRoot, 'dist', 'core', 'lbug', 'lbug-config.js');
    const original = readFileSync(configPath, 'utf8');
    const checkpointMatcher = "msg.includes('checkpoint is in progress')";

    // Newer upstream versions may already recognize LadybugDB's transient
    // checkpoint wording. In that case the compatibility patch is unnecessary.
    if (original.includes(checkpointMatcher)) return;

    const busyMatcher = "msg.includes('busy') ||";
    const occurrences = original.split(busyMatcher).length - 1;
    if (occurrences !== 1) {
        throw new Error(`GitNexus busy-error matcher changed upstream (${occurrences} matches); checkpoint retry customization was not applied.`);
    }

    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const patched = original.replace(
        busyMatcher,
        `${busyMatcher}${eol}        ${checkpointMatcher} ||`,
    );
    writeFileSync(configPath, patched);
}
