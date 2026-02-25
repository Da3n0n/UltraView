import * as vscode from 'vscode';
import { getSvgEditorStyles, getSvgEditorHtml } from './svgEditorHtml';
import { getSvgEditorScript } from './svgEditorScript';

export function buildSvgEditorPage(_webview: vscode.Webview): string {
    const styles = getSvgEditorStyles();
    const html = getSvgEditorHtml();
    const script = getSvgEditorScript();

    const cfg = vscode.workspace.getConfiguration('ultraview.svg');
    const defaultView = cfg.get<string>('defaultView', 'preview');

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
${styles}
</style>
</head>
<body>
${html}
<script>
// Injected from VS Code settings
window.__SVG_DEFAULT_VIEW__ = ${JSON.stringify(defaultView)};
${script}
</script>
</body>
</html>`;
}
