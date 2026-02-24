import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

let cachedHtml: string | undefined;
let cacheError: string | undefined;

export function clearGitCache() {
  cachedHtml = undefined;
  cacheError = undefined;
}

export function buildGitHtml(context?: vscode.ExtensionContext): string {
  if (cachedHtml) return cachedHtml;
  let htmlPath: string;
  if (context) {
    htmlPath = context.asAbsolutePath('gitPanel.html');
  } else {
    htmlPath = path.join(__dirname, 'gitPanel.html');
  }

  try {
    cachedHtml = fs.readFileSync(htmlPath, 'utf8');
  } catch (err) {
    cacheError = err instanceof Error ? err.message : String(err);
    cachedHtml = '<html><body>Error loading git panel</body></html>';
    console.error('[Ultraview] Failed to load gitPanel.html:', cacheError);
  }
  return cachedHtml;
}
