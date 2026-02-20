import * as vscode from 'vscode';
import { getEditorStyles, getEditorHtml } from './editorHtml';
import { getEditorScript } from './editorScript';

export function buildEditorPage(_webview: vscode.Webview): string {
  const styles = getEditorStyles();
  const html = getEditorHtml();
  const script = getEditorScript();

  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
${styles}
</style>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
</head>
<body>
${html}
<script>
${script}
</script>
</body>
</html>`;
}
