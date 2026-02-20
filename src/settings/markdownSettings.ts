import * as vscode from 'vscode';

export type MarkdownStyle = 'obsidian' | 'github';

export interface MarkdownSettings {
  defaultView: 'split' | 'edit' | 'preview';
  style: MarkdownStyle;
  autoSave: boolean;
  autoSaveDelay: number;
  fontSize: number;
  showStatusBar: boolean;
  wordWrap: boolean;
}

export const defaultMarkdownSettings: MarkdownSettings = {
  defaultView: 'preview',
  style: 'obsidian',
  autoSave: true,
  autoSaveDelay: 1000,
  fontSize: 14,
  showStatusBar: true,
  wordWrap: true
};

export function getMarkdownSettings(): MarkdownSettings {
  const config = vscode.workspace.getConfiguration('ultraview.markdown');
  return {
    defaultView: config.get('defaultView', defaultMarkdownSettings.defaultView) as 'split' | 'edit' | 'preview',
    style: config.get('style', defaultMarkdownSettings.style) as MarkdownStyle,
    autoSave: config.get('autoSave', defaultMarkdownSettings.autoSave),
    autoSaveDelay: config.get('autoSaveDelay', defaultMarkdownSettings.autoSaveDelay),
    fontSize: config.get('fontSize', defaultMarkdownSettings.fontSize),
    showStatusBar: config.get('showStatusBar', defaultMarkdownSettings.showStatusBar),
    wordWrap: config.get('wordWrap', defaultMarkdownSettings.wordWrap)
  };
}
