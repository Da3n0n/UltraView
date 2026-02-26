import * as vscode from 'vscode';
import * as path from 'path';
import { buildModel3dPage } from './builder';

export class Model3dDocument implements vscode.CustomDocument {
    constructor(public readonly uri: vscode.Uri) {}
    dispose(): void {}
}

export class Model3dProvider implements vscode.CustomReadonlyEditorProvider<Model3dDocument> {
    constructor(private readonly _ctx: vscode.ExtensionContext) {}

    openCustomDocument(
        uri: vscode.Uri,
        _openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken
    ): Model3dDocument {
        return new Model3dDocument(uri);
    }

    async resolveCustomEditor(
        document: Model3dDocument,
        panel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const fileUri = document.uri;
        const folderUri = vscode.Uri.file(path.dirname(fileUri.fsPath));

        // Grant the webview access to the file's folder so GLTF external
        // refs (.bin files, textures) resolve via asWebviewUri.
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [folderUri],
        };

        panel.webview.html = buildModel3dPage(panel.webview, fileUri);
    }
}
