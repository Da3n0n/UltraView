(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('ultraview') !== '1') return;

  const root = document.documentElement;
  root.dataset.ultraviewEmbedded = 'true';
  if (params.get('uv-transparent') === '1') root.dataset.ultraviewTransparent = 'true';
  const variables = {
    'uv-editor-bg': '--ultraview-editor-background',
    'uv-editor-fg': '--ultraview-editor-foreground',
    'uv-sidebar-bg': '--ultraview-side-bar-background',
    'uv-input-bg': '--ultraview-input-background',
    'uv-list-hover-bg': '--ultraview-list-hover-background',
    'uv-panel-border': '--ultraview-panel-border',
    'uv-input-border': '--ultraview-input-border',
    'uv-description-fg': '--ultraview-description-foreground',
    'uv-font-family': '--ultraview-font-family',
  };

  for (const [parameter, property] of Object.entries(variables)) {
    const value = params.get(parameter)?.trim();
    if (value) root.style.setProperty(property, value);
  }
})();
