import * as vscode from 'vscode';
import { buildPortsHtml } from '../ports/portsUi';
import { getOpenPorts, killProcess } from '../ports/portManager';

export class PortsProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'ultraview.ports';
    private view?: vscode.WebviewView;

    constructor(private context: vscode.ExtensionContext) { }

    // open the ports view as a standalone editor panel (same HTML as the sidebar)
    static openAsPanel(ctx: vscode.ExtensionContext): void {
        const panel = vscode.window.createWebviewPanel(
            'ultraview.portsPanel',
            'Ports & Processes',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        panel.webview.html = buildPortsHtml();

        // mirror the same message handling that the sidebar view uses
        panel.webview.onDidReceiveMessage(async msg => {
            switch (msg.type) {
                case 'ready':
                case 'refresh':
                    try {
                        const ports = await getOpenPorts();
                        panel.webview.postMessage({ type: 'state', ports });
                    } catch {
                        panel.webview.postMessage({ type: 'state', ports: [] });
                    }
                    break;
                case 'kill':
                    try {
                        await killProcess(msg.pid);
                        vscode.window.showInformationMessage(`Successfully killed process ${msg.pid}`);
                        await new Promise(r => setTimeout(r, 1000));
                        const ports = await getOpenPorts();
                        panel.webview.postMessage({ type: 'state', ports });
                    } catch (e: any) {
                        vscode.window.showErrorMessage(`Failed to kill process ${msg.pid}: ${e?.message}`);
                        const ports = await getOpenPorts();
                        panel.webview.postMessage({ type: 'state', ports });
                    }
                    break;
            }
        });

    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = buildPortsHtml();

        webviewView.webview.onDidReceiveMessage(async msg => {
            switch (msg.type) {
                case 'ready':
                case 'refresh': {
                    await this.postState();
                    break;
                }
                case 'kill': {
                    try {
                        await killProcess(msg.pid);
                        vscode.window.showInformationMessage(`Successfully killed process ${msg.pid}`);
                        await new Promise(r => setTimeout(r, 1000)); // Wait a bit for system to close port
                        await this.postState();
                    } catch (e: any) {
                        vscode.window.showErrorMessage(`Failed to kill process ${msg.pid}: ${e?.message}`);
                        await this.postState(); // reset button state
                    }
                    break;
                }
                case 'openPanel': {
                    vscode.commands.executeCommand('ultraview.openPorts');
                    break;
                }
            }
        });

        // Handle visibility changes to refresh data
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.postState();
            }
        });
    }

    private async postState() {
        if (!this.view) return;
        try {
            const ports = await getOpenPorts();
            this.view.webview.postMessage({ type: 'state', ports });
        } catch (e) {
            this.view.webview.postMessage({ type: 'state', ports: [] });
        }
    }
}
