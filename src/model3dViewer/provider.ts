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
        const fileFolderUri = vscode.Uri.file(path.dirname(fileUri.fsPath));

        // Build a list of resource roots: the file's folder, all workspace
        // folders, and the drive root as a fallback. This ensures that OBJ's
        // .mtl files and their texture references (which may live in sibling
        // or parent folders) are all accessible as vscode-resource: URLs.
        const roots: vscode.Uri[] = [fileFolderUri];

        // Add all open workspace folders
        if (vscode.workspace.workspaceFolders) {
            for (const wf of vscode.workspace.workspaceFolders) {
                roots.push(wf.uri);
            }
        }

        // Add the drive root so any absolute path in the same drive resolves.
        // On Windows this is e.g. C:\, on macOS/Linux it is /.
        const driveRoot = path.parse(fileUri.fsPath).root;
        if (driveRoot) {
            roots.push(vscode.Uri.file(driveRoot));
        }

        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: roots,
        };

        panel.webview.html = buildModel3dPage(panel.webview, fileUri);
    }
}
