import * as vscode from 'vscode';

export interface CodeGraphSettings {
  nodeSize: number;
  fontSize: number;
  showLabels: boolean;
  layoutDirection: 'horizontal' | 'vertical' | 'radial';
  clusterBy: 'file' | 'folder' | 'none';
  showImports: boolean;
  showExports: boolean;
  nodeColors: {
    ts: string;
    other: string;
    md: string;
    fn: string;
  };
}

export const defaultCodeGraphSettings: CodeGraphSettings = {
  nodeSize: 20,
  fontSize: 12,
  showLabels: true,
  layoutDirection: 'horizontal',
  clusterBy: 'folder',
  showImports: true,
  showExports: true,
  nodeColors: {
    ts: '#4EC9B0',
    other: '#9CDCFE',
    md: '#C586C0',
    fn: '#DCDCAA'
  }
};

export function getCodeGraphSettings(): CodeGraphSettings {
  const config = vscode.workspace.getConfiguration('ultraview.codeGraph');
  return {
    nodeSize: config.get('nodeSize', defaultCodeGraphSettings.nodeSize),
    fontSize: config.get('fontSize', defaultCodeGraphSettings.fontSize),
    showLabels: config.get('showLabels', defaultCodeGraphSettings.showLabels),
    layoutDirection: config.get('layoutDirection', defaultCodeGraphSettings.layoutDirection) as 'horizontal' | 'vertical' | 'radial',
    clusterBy: config.get('clusterBy', defaultCodeGraphSettings.clusterBy) as 'file' | 'folder' | 'none',
    showImports: config.get('showImports', defaultCodeGraphSettings.showImports),
    showExports: config.get('showExports', defaultCodeGraphSettings.showExports),
    nodeColors: defaultCodeGraphSettings.nodeColors
  };
}
