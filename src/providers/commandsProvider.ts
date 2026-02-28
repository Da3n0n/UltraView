import * as vscode from 'vscode';
import { buildCommandsHtml } from '../commands/commandsUi';
import { scanCommands } from '../commands/commandScanner';

export class CommandsProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'ultraview.commands';
  private view?: vscode.WebviewView;

  constructor(private context: vscode.ExtensionContext) {}

  static openAsPanel(ctx: vscode.ExtensionContext): void {
    const panel = vscode.window.createWebviewPanel(
      'ultraview.commandsPanel',
      'Commands',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.webview.html = buildCommandsHtml();
    panel.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case 'ready':
        case 'refresh':
          await postCommands(panel.webview);
          break;
        case 'run':
          runInTerminal(msg.cmd);
          break;
      }
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = buildCommandsHtml();

    webviewView.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case 'ready':
        case 'refresh':
          await this.postState();
          break;
        case 'run':
          runInTerminal(msg.cmd);
          break;
        case 'openPanel':
          vscode.commands.executeCommand('ultraview.openCommands');
          break;
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this.postState();
    });
  }

  private async postState(): Promise<void> {
    if (!this.view) return;
    const commands = await scanCommands(
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
    );
    this.view.webview.postMessage({ type: 'state', commands });
  }
}

function runInTerminal(cmd: string): void {
  let terminal = vscode.window.terminals.find(t => t.name === 'UltraView: Commands');
  if (!terminal) {
    terminal = vscode.window.createTerminal({ name: 'UltraView: Commands' });
  }
  terminal.show();
  terminal.sendText(cmd);
}

async function postCommands(webview: vscode.Webview): Promise<void> {
  const commands = await scanCommands(
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
  );
  webview.postMessage({ type: 'state', commands });
}
