import * as vscode from 'vscode';
import * as fs from 'fs';
import { SvgDocument, buildSvgEditorPage } from '../svgEditor';

export class SvgProvider implements vscode.CustomEditorProvider<SvgDocument> {
    private readonly _onDidChangeCustomDocument =
        new vscode.EventEmitter<vscode.CustomDocumentEditEvent<SvgDocument>>();
    onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

    constructor(_ctx: vscode.ExtensionContext) { }

    openCustomDocument(
        uri: vscode.Uri,
        _openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken
    ): SvgDocument {
        return new SvgDocument(uri);
    }

    async resolveCustomEditor(
        document: SvgDocument,
        panel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const uri = document.uri;

        // Yield one tick so VS Code can finish registering tabs (diff guard).
        await new Promise<void>(resolve => setTimeout(resolve, 0));

        const isInDiff = vscode.window.tabGroups.all.some(group =>
            group.tabs.some(tab => {
                if (tab.input instanceof vscode.TabInputTextDiff) {
                    return (tab.input as vscode.TabInputTextDiff).modified.toString() === uri.toString();
                }
                if (tab.input instanceof vscode.TabInputCustom) {
                    const c = tab.input as vscode.TabInputCustom;
                    return c.uri.toString() === uri.toString() && tab.label.includes('Working Tree');
                }
                return false;
            })
        );

        if (isInDiff) {
            panel.dispose();
            return;
        }

        panel.webview.options = { enableScripts: true };
        const filePath = document.uri.fsPath;
        let lastSelfWriteTime = 0;

        const updateContent = () => {
            const raw = fs.readFileSync(filePath, 'utf8');
            panel.webview.postMessage({ type: 'setContent', content: raw });
        };

        panel.webview.html = buildSvgEditorPage(panel.webview);

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

    saveCustomDocument(
        _document: SvgDocument,
        _cancellation: vscode.CancellationToken
    ): Thenable<void> {
        return Promise.resolve();
    }

    saveCustomDocumentAs(
        document: SvgDocument,
        _destination: vscode.Uri,
        cancellation: vscode.CancellationToken
    ): Thenable<void> {
        return this.saveCustomDocument(document, cancellation);
    }

    revertCustomDocument(
        _document: SvgDocument,
        _cancellation: vscode.CancellationToken
    ): Thenable<void> {
        return Promise.resolve();
    }

    backupCustomDocument(
        _document: SvgDocument,
        context: vscode.CustomDocumentBackupContext,
        _cancellation: vscode.CancellationToken
    ): Thenable<vscode.CustomDocumentBackup> {
        return Promise.resolve({ id: context.destination.fsPath, delete: () => { } });
    }
}
