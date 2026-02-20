export interface CodeGraphSettings {
  nodeSize: number;
  fontSize: number;
  showLabels: boolean;
  layoutDirection: 'horizontal' | 'vertical' | 'radial';
  clusterBy: 'file' | 'folder' | 'none';
  showImports: boolean;
  showExports: boolean;
}

export const defaultCodeGraphSettings: CodeGraphSettings = {
  nodeSize: 20,
  fontSize: 12,
  showLabels: true,
  layoutDirection: 'horizontal',
  clusterBy: 'folder',
  showImports: true,
  showExports: true
};

export function getCodeGraphSettings(): CodeGraphSettings {
  return { ...defaultCodeGraphSettings };
}
