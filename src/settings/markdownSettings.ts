export interface MarkdownSettings {
  defaultView: 'split' | 'edit' | 'preview';
  autoSave: boolean;
  autoSaveDelay: number;
  fontSize: number;
  showStatusBar: boolean;
  wordWrap: boolean;
}

export const defaultMarkdownSettings: MarkdownSettings = {
  defaultView: 'preview',
  autoSave: true,
  autoSaveDelay: 1000,
  fontSize: 14,
  showStatusBar: true,
  wordWrap: true
};

export function getMarkdownSettings(): MarkdownSettings {
  return { ...defaultMarkdownSettings };
}
