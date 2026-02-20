import * as vscode from 'vscode';
import * as fs from 'fs';
import { MarkdownDocument, buildEditorPage } from '../editor';

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
    panel.webview.options = { enableScripts: true };
    const filePath = document.uri.fsPath;

    const updateContent = () => {
      const raw = fs.readFileSync(filePath, 'utf8');
      panel.webview.postMessage({ type: 'setContent', content: raw });
    };

    panel.webview.html = buildEditorPage(panel.webview);

    panel.webview.onDidReceiveMessage((msg: { type: string; content?: string }) => {
      switch (msg.type) {
        case 'ready':
          updateContent();
          break;
        case 'save':
          if (msg.content !== undefined) {
            fs.writeFileSync(filePath, msg.content, 'utf8');
            document.setContent(msg.content);
          }
          break;
      }
    });

    const watcher = fs.watch(filePath, () => updateContent());
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
