import * as vscode from 'vscode';
import { SqliteProvider } from './providers/sqliteProvider';
import { DuckDbProvider } from './providers/duckdbProvider';
import { AccessProvider } from './providers/accessProvider';
import { SqlDumpProvider } from './providers/sqlDumpProvider';
import { MarkdownProvider } from './providers/markdownProvider';
import { IndexProvider } from './providers/indexProvider';
import { CodeGraphProvider } from './providers/codeGraphProvider';
import { GitProvider } from './providers/gitProvider';
import { CustomComments } from './customComments/index';
import { ProjectsProvider } from './providers/projectsProvider';


let customComments: CustomComments;

export function activate(context: vscode.ExtensionContext) {
  customComments = new CustomComments(context);
  
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'ultraview.sqlite',
      new SqliteProvider(context),
      { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.window.registerCustomEditorProvider(
      'ultraview.duckdb',
      new DuckDbProvider(context),
      { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.window.registerCustomEditorProvider(
      'ultraview.access',
      new AccessProvider(context),
      { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.window.registerCustomEditorProvider(
      'ultraview.sqldump',
      new SqlDumpProvider(context),
      { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.window.registerCustomEditorProvider(
      'ultraview.markdown',
      new MarkdownProvider(context),
      { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.window.registerCustomEditorProvider(
      'ultraview.index',
      new IndexProvider(context),
      { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.window.registerWebviewViewProvider(
      CodeGraphProvider.viewId,
      new CodeGraphProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.window.registerWebviewViewProvider(
      GitProvider.viewId,
      new GitProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.window.registerWebviewViewProvider(
      ProjectsProvider.viewId,
      new ProjectsProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.commands.registerCommand('ultraview.openCodeGraph', () => {
      CodeGraphProvider.openAsPanel(context);
    }),
    vscode.commands.registerCommand('ultraview.openGitProjects', () => {
      GitProvider.openAsPanel(context);
    }),
    vscode.commands.registerCommand('ultraview.openUrl', async (url?: string) => {
      if (url && typeof url === 'string') {
        if (!/^https?:\/\//.test(url)) {
          url = 'https://' + url;
        }
        vscode.commands.executeCommand('simpleBrowser.show', url);
      } else {
        const input = await vscode.window.showInputBox({
          prompt: 'Enter URL to open',
          placeHolder: 'https://example.com',
          value: 'https://'
        });
        if (input) {
          let finalUrl = input;
          if (!/^https?:\/\//.test(finalUrl)) {
            finalUrl = 'https://' + finalUrl;
          }
          vscode.commands.executeCommand('simpleBrowser.show', finalUrl);
        }
      }
    }),
    vscode.commands.registerCommand('ultraview.enableCustomComments', async () => {
      const result = await customComments.enable();
      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    }),
    vscode.commands.registerCommand('ultraview.disableCustomComments', async () => {
      const result = await customComments.disable();
      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    }),
    vscode.commands.registerCommand('ultraview.toggleCustomComments', () => {
      customComments.toggle();
    }),
    vscode.commands.registerCommand('ultraview.refreshCustomComments', () => {
      customComments.updateCss();
    })
  );
}

export function deactivate() {}
