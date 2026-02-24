import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const CSS_ID = 'ultraview-custom-comments-css';
const CSS_FILE_NAME = 'ultraview-comments.css';

export class CustomComments {
  private context: vscode.ExtensionContext;
  private enabled: boolean = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.enabled = this.checkEnabled();
  }

  private getConfig() {
    const config = vscode.workspace.getConfiguration('ultraview.customComments');
    return {
      fontFamily: config.get<string>('fontFamily', 'Fira Code'),
      fontSize: config.get<string>('fontSize', ''),
      fontStyle: config.get<string>('fontStyle', 'italic'),
      fontWeight: config.get<string>('fontWeight', ''),
      color: config.get<string>('color', ''),
      enabled: config.get<boolean>('enabled', false)
    };
  }

  private getVscodeBasePath(): string | null {
    const appRoot = vscode.env.appRoot;
    if (!appRoot || !fs.existsSync(appRoot)) {
      return null;
    }
    return appRoot;
  }

  private getAllPossiblePaths(): string[] {
    const appRoot = this.getVscodeBasePath();
    const paths: string[] = [];

    if (appRoot) {
      const subdirs = ['', 'electron-sandbox', 'electron', 'electron-browser'];
      const suffixes = ['workbench.html', 'workbench.esm.html'];

      for (const sub of subdirs) {
        const base = sub 
          ? path.join(appRoot, 'out', 'vs', 'code', sub)
          : path.join(appRoot, 'out', 'vs', 'code');
        
        for (const suffix of suffixes) {
          paths.push(path.join(base, 'workbench', suffix));
        }
      }
    }

    const exePath = process.execPath;
    const exeDir = path.dirname(exePath);
    
    const installBasePaths = [
      exeDir,
      path.join(exeDir, '..'),
      'C:\\Program Files\\Microsoft VS Code',
      'C:\\Program Files (x86)\\Microsoft VS Code',
    ];

    for (const base of installBasePaths) {
      if (base && fs.existsSync(base)) {
        paths.push(path.join(base, 'resources', 'app', 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.html'));
        paths.push(path.join(base, 'resources', 'app', 'out', 'vs', 'code', 'electron', 'workbench', 'workbench.html'));
      }
    }

    return paths;
  }

  private getWorkbenchHtmlPath(): string | null {
    const possiblePaths = this.getAllPossiblePaths();
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        console.log('[Ultraview] Found workbench.html at:', p);
        return p;
      }
    }
    
    console.log('[Ultraview] appRoot:', vscode.env.appRoot);
    console.log('[Ultraview] Searched paths:', possiblePaths);
    return null;
  }

  private getCssFilePath(): string {
    return path.join(this.context.globalStorageUri.fsPath, CSS_FILE_NAME);
  }

  private generateCss(): string {
    const config = this.getConfig();
    let css = '/* Ultraview Custom Comments Font */\n';
    css += '.monaco-editor .mtk.comment,\n';
    css += '.monaco-editor .mtk3,\n';
    css += '.monaco-editor .c-comment,\n';
    css += '.monaco-editor span[class*="comment"] {\n';
    
    if (config.fontFamily) {
      css += `  font-family: '${config.fontFamily}', monospace !important;\n`;
    }
    if (config.fontSize) {
      css += `  font-size: ${config.fontSize} !important;\n`;
    }
    if (config.fontStyle) {
      css += `  font-style: ${config.fontStyle} !important;\n`;
    }
    if (config.fontWeight) {
      css += `  font-weight: ${config.fontWeight} !important;\n`;
    }
    if (config.color) {
      css += `  color: ${config.color} !important;\n`;
    }
    css += '}\n';
    
    return css;
  }

  private async ensureCssFile(): Promise<string> {
    const cssPath = this.getCssFilePath();
    const cssDir = path.dirname(cssPath);
    
    if (!fs.existsSync(cssDir)) {
      fs.mkdirSync(cssDir, { recursive: true });
    }
    
    const css = this.generateCss();
    fs.writeFileSync(cssPath, css, 'utf8');
    
    return cssPath;
  }

  private checkEnabled(): boolean {
    const workbenchPath = this.getWorkbenchHtmlPath();
    if (!workbenchPath) return false;
    
    try {
      const content = fs.readFileSync(workbenchPath, 'utf8');
      return content.includes(CSS_ID);
    } catch {
      return false;
    }
  }

  async enable(): Promise<{ success: boolean; message: string }> {
    const workbenchPath = this.getWorkbenchHtmlPath();
    if (!workbenchPath) {
      const searchedPaths = this.getAllPossiblePaths();
      return { 
        success: false, 
        message: `Could not find VS Code workbench.html.\n\nSearched paths:\n${searchedPaths.join('\n')}\n\nVS Code appRoot: ${vscode.env.appRoot || 'undefined'}\n\nThis feature may not work with VS Code Insiders or Snap installations.` 
      };
    }

    try {
      const cssPath = await this.ensureCssFile();
      const cssUri = `file://${cssPath.replace(/\\/g, '/')}`;
      
      let content = fs.readFileSync(workbenchPath, 'utf8');
      
      if (content.includes(CSS_ID)) {
        content = this.removeExistingInjection(content);
      }
      
      const linkTag = `\n<!-- ${CSS_ID} --><link rel="stylesheet" href="${cssUri}"/><!-- /${CSS_ID} -->\n`;
      content = content.replace('</head>', `${linkTag}</head>`);
      
      fs.writeFileSync(workbenchPath, content, 'utf8');
      this.enabled = true;
      
      return { 
        success: true, 
        message: 'Custom comments font enabled! Please restart VS Code for changes to take effect.' 
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      
      if (errorMsg.includes('EPERM') || errorMsg.includes('access denied')) {
        return { 
          success: false, 
          message: 'Permission denied. Try running VS Code as administrator, or grant write access to:\n' + workbenchPath 
        };
      }
      return { success: false, message: `Failed to enable: ${errorMsg}` };
    }
  }

  async disable(): Promise<{ success: boolean; message: string }> {
    const workbenchPath = this.getWorkbenchHtmlPath();
    if (!workbenchPath) {
      return { success: false, message: 'Could not find VS Code workbench.html file.' };
    }

    try {
      let content = fs.readFileSync(workbenchPath, 'utf8');
      
      if (!content.includes(CSS_ID)) {
        return { success: true, message: 'Custom comments font is already disabled.' };
      }
      
      content = this.removeExistingInjection(content);
      fs.writeFileSync(workbenchPath, content, 'utf8');
      this.enabled = false;
      
      return { 
        success: true, 
        message: 'Custom comments font disabled! Please restart VS Code for changes to take effect.' 
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Failed to disable: ${errorMsg}` };
    }
  }

  private removeExistingInjection(content: string): string {
    const regex = new RegExp(
      `\\n?<!-- ${CSS_ID} -->[^]*?<!-- /${CSS_ID} -->\\n?`,
      'g'
    );
    return content.replace(regex, '\n');
  }

  async toggle(): Promise<void> {
    const result = this.enabled 
      ? await this.disable() 
      : await this.enable();
    
    if (result.success) {
      vscode.window.showInformationMessage(result.message);
    } else {
      vscode.window.showErrorMessage(result.message);
    }
  }

  async updateCss(): Promise<void> {
    if (!this.enabled) return;
    
    try {
      await this.ensureCssFile();
      vscode.window.showInformationMessage('Custom comments CSS updated. Restart VS Code to see changes.');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to update CSS: ${errorMsg}`);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
