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
  return { ...defaultCodeGraphSettings };
}
