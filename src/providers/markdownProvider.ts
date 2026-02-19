import * as vscode from 'vscode';
import * as fs from 'fs';
import { marked } from 'marked';

export class MarkdownProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly _ctx: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    panel.webview.options = { enableScripts: true };
    const filePath = document.uri.fsPath;
    const render = () => {
      const raw = fs.readFileSync(filePath, 'utf8');
      const html = marked.parse(raw) as string;
      panel.webview.html = buildMdHtml(html);
    };

    render();

    // Re-render on file change
    const watcher = fs.watch(filePath, () => render());
    panel.onDidDispose(() => watcher.close());
  }
}

function buildMdHtml(body: string): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  :root {
    --bg:      var(--vscode-editor-background);
    --surface: var(--vscode-sideBar-background,  var(--vscode-editor-background));
    --border:  var(--vscode-panel-border,         rgba(128,128,128,0.35));
    --text:    var(--vscode-editor-foreground);
    --muted:   var(--vscode-descriptionForeground);
    --accent:  var(--vscode-textLink-foreground,  var(--vscode-button-background));
    --green:   var(--vscode-terminal-ansiGreen,   #4ec9b0);
    --yellow:  var(--vscode-terminal-ansiYellow,  #dcdcaa);
    --red:     var(--vscode-terminal-ansiRed,     #f44747);
    --code-bg: var(--vscode-input-background,     var(--vscode-editor-background));
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .wrapper { max-width: 860px; margin: 0 auto; padding: 40px 24px 80px; }
  h1,h2,h3,h4,h5,h6 { color: var(--accent); margin: 1.5em 0 0.5em; font-weight: 600; line-height: 1.3; }
  h1 { font-size: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 0.4em; }
  h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
  h3 { font-size: 1.2rem; }
  p { line-height: 1.8; margin: 0.8em 0; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: var(--code-bg); padding: 2px 6px; border-radius: 4px; font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size: 0.88em; color: var(--green); }
  pre { background: var(--code-bg); padding: 16px; border-radius: 8px; overflow-x: auto; margin: 1em 0; border: 1px solid var(--border); }
  pre code { padding: 0; background: none; color: inherit; }
  blockquote { border-left: 3px solid var(--accent); margin: 1em 0; padding: 8px 16px; background: var(--surface); border-radius: 0 6px 6px 0; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 0.92em; }
  th { background: var(--surface); color: var(--accent); text-align: left; padding: 8px 12px; border: 1px solid var(--border); font-weight: 600; }
  td { padding: 7px 12px; border: 1px solid var(--border); }
  tr:nth-child(even) td { background: rgba(255,255,255,0.03); }
  ul, ol { margin: 0.8em 0 0.8em 1.6em; line-height: 1.8; }
  li { margin: 0.2em 0; }
  hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }
  img { max-width: 100%; border-radius: 6px; }
  input[type=checkbox] { margin-right: 6px; }
  .tag { display: inline-block; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; padding: 2px 8px; font-size: 0.8em; color: var(--muted); margin: 2px; }
</style>
</head>
<body>
<div class="wrapper">
${body}
</div>
</body>
</html>`;
}
