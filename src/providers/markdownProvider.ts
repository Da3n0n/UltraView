import * as vscode from 'vscode';
import * as fs from 'fs';
import { MarkdownDocument, buildEditorPage } from '../editor';
import { getMarkdownSettings } from '../settings/markdownSettings';

export class MarkdownProvider implements vscode.CustomEditorProvider<MarkdownDocument> {
  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<MarkdownDocument>>();
  onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  constructor(private readonly _ctx: vscode.ExtensionContext) {}

  openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): MarkdownDocument {
    return new MarkdownDocument(uri);
  }

  async resolveCustomEditor(
    document: MarkdownDocument,
    panel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // If this file is the working-tree (modified) side of an open diff editor, let VS Code
    // handle it as a plain text editor instead of opening Ultraview.
    const uri = document.uri;
    const isInDiff = vscode.window.tabGroups.all.some(group =>
      group.tabs.some(tab =>
        tab.input instanceof vscode.TabInputTextDiff &&
        (tab.input as vscode.TabInputTextDiff).modified.toString() === uri.toString()
      )
    );
    if (isInDiff) {
      panel.dispose();
      setTimeout(() => vscode.window.showTextDocument(uri, { preview: true }), 0);
      return;
    }

    panel.webview.options = { enableScripts: true };
    const filePath = document.uri.fsPath;
    let lastSelfWriteTime = 0;

    const updateContent = () => {
      const raw = fs.readFileSync(filePath, 'utf8');
      panel.webview.postMessage({ type: 'setContent', content: raw });
    };

    panel.webview.html = buildEditorPage(panel.webview, getMarkdownSettings().style);

    panel.webview.onDidReceiveMessage((msg: { type: string; content?: string }) => {
      switch (msg.type) {
        case 'ready':
          updateContent();
          break;
        case 'save':
          if (msg.content !== undefined) {
            lastSelfWriteTime = Date.now();
            fs.writeFileSync(filePath, msg.content, 'utf8');
            document.setContent(msg.content);
          }
          break;
      }
    });

    const watcher = fs.watch(filePath, () => {
      if (Date.now() - lastSelfWriteTime < 500) return;
      updateContent();
    });
    panel.onDidDispose(() => watcher.close());
  }

  saveCustomDocument(_document: MarkdownDocument, _cancellation: vscode.CancellationToken): Thenable<void> {
    return Promise.resolve();
  }

  saveCustomDocumentAs(document: MarkdownDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
    return this.saveCustomDocument(document, cancellation);
  }

  revertCustomDocument(_document: MarkdownDocument, _cancellation: vscode.CancellationToken): Thenable<void> {
    return Promise.resolve();
  }

  backupCustomDocument(_document: MarkdownDocument, context: vscode.CustomDocumentBackupContext, _cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
    return Promise.resolve({ id: context.destination.fsPath, delete: () => {} });
  }
}
