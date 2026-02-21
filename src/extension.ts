import * as vscode from 'vscode';
import { SqliteProvider } from './providers/sqliteProvider';
import { DuckDbProvider } from './providers/duckdbProvider';
import { AccessProvider } from './providers/accessProvider';
import { SqlDumpProvider } from './providers/sqlDumpProvider';
import { MarkdownProvider } from './providers/markdownProvider';
import { IndexProvider } from './providers/indexProvider';
import { CodeGraphProvider } from './providers/codeGraphProvider';

export function activate(context: vscode.ExtensionContext) {
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
    vscode.commands.registerCommand('ultraview.openCodeGraph', () => {
      CodeGraphProvider.openAsPanel(context);
    })
  );
}

export function deactivate() {}
