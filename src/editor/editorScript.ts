export function getEditorScript(): string {
  const script = `
(function() {
  'use strict';
  const vscode = acquireVsCodeApi();
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const wrap = document.getElementById('editor-wrap');
  const viewMode = document.getElementById('view-mode');

  let saveTimeout = null;
  let content = '';

  function updatePreview() {
    content = editor.value;
    preview.innerHTML = marked.parse(content);
    updateStats();
  }

  function updateStats() {
    const lines = content.split('\\n').length;
    const words = content.trim() ? content.trim().split(/\\s+/).length : 0;
    const chars = content.length;
    document.getElementById('stat-lines').textContent = 'Lines: ' + lines;
    document.getElementById('stat-words').textContent = 'Words: ' + words;
    document.getElementById('stat-chars').textContent = 'Chars: ' + chars;
  }

  function save() {
    vscode.postMessage({ type: 'save', content: editor.value });
  }

  function autoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(save, 1000);
  }

  function wrapSelection(before, after, placeholder) {
    after = after || before;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const sel = editor.value.substring(start, end) || placeholder || '';
    const replacement = before + sel + after;
    editor.setRangeText(replacement, start, end, 'end');
    editor.focus();
    updatePreview();
    autoSave();
  }

  function insertAtCursor(text, moveCursor) {
    const start = editor.selectionStart;
    editor.setRangeText(text, start, start, 'end');
    if (moveCursor) {
      editor.selectionStart = editor.selectionEnd = start + moveCursor;
    }
    editor.focus();
    updatePreview();
    autoSave();
  }

  function insertLine(prefix) {
    const start = editor.selectionStart;
    const lineStart = editor.value.lastIndexOf('\\n', start - 1) + 1;
    editor.setRangeText(prefix, lineStart, lineStart, 'end');
    editor.focus();
    updatePreview();
    autoSave();
  }

  function toggleHeading(level) {
    const start = editor.selectionStart;
    const lineStart = editor.value.lastIndexOf('\\n', start - 1) + 1;
    const lineEnd = editor.value.indexOf('\\n', start);
    const fullLineEnd = lineEnd === -1 ? editor.value.length : lineEnd;
    const line = editor.value.substring(lineStart, fullLineEnd);
    const prefix = '#'.repeat(level) + ' ';
    
    let newLine;
    if (/^#{1,6}\\s/.test(line)) {
      newLine = prefix + line.replace(/^#{1,6}\\s/, '');
    } else {
      newLine = prefix + line;
    }
    editor.setRangeText(newLine, lineStart, fullLineEnd, 'end');
    editor.focus();
    updatePreview();
    autoSave();
  }

  const actions = {
    bold: () => wrapSelection('**', '**', 'bold text'),
    italic: () => wrapSelection('*', '*', 'italic text'),
    strike: () => wrapSelection('~~', '~~', 'strikethrough'),
    code: () => wrapSelection('\`', '\`', 'code'),
    h1: () => toggleHeading(1),
    h2: () => toggleHeading(2),
    h3: () => toggleHeading(3),
    h4: () => toggleHeading(4),
    h5: () => toggleHeading(5),
    h6: () => toggleHeading(6),
    ul: () => insertLine('- '),
    ol: () => insertLine('1. '),
    task: () => insertLine('- [ ] '),
    quote: () => insertLine('> '),
    link: () => wrapSelection('[', '](url)', 'link text'),
    image: () => insertAtCursor('![alt text](url)', 2),
    hr: () => insertAtCursor('\\n---\\n'),
    codeblock: () => insertAtCursor('\\n\`\`\`\\ncode here\\n\`\`\`\\n', 4),
    table: () => insertAtCursor('\\n| Header 1 | Header 2 |\\n|----------|----------|\\n| Cell 1   | Cell 2   |\\n')
  };

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (actions[action]) actions[action]();
    });
  });

  editor.addEventListener('input', () => {
    updatePreview();
    autoSave();
  });

  editor.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch(e.key.toLowerCase()) {
        case 'b': e.preventDefault(); actions.bold(); break;
        case 'i': e.preventDefault(); actions.italic(); break;
        case 's': e.preventDefault(); save(); break;
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      insertAtCursor('  ', 0);
    }
  });

  viewMode.addEventListener('change', () => {
    wrap.className = 'editor-wrap ' + viewMode.value;
    const editPane = document.getElementById('edit-pane');
    const previewPane = document.getElementById('preview-pane');
    if (viewMode.value === 'split') {
      editPane.classList.add('visible');
      previewPane.classList.add('visible');
    } else if (viewMode.value === 'edit') {
      editPane.classList.add('visible');
      previewPane.classList.remove('visible');
    } else {
      editPane.classList.remove('visible');
      previewPane.classList.add('visible');
    }
  });

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'setContent') {
      editor.value = msg.content;
      updatePreview();
    }
  });

  vscode.postMessage({ type: 'ready' });
})();`;

  return script;
}
