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
  let previewSyncTimeout = null;
  let content = '';
  let lastPreviewHtml = '';

  function htmlToMarkdown(html) {
    if (typeof TurndownService !== 'undefined') {
      const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
      return turndown.turndown(html);
    }
    return html.replace(/<br\\s*\\/?>/gi, '\\n')
               .replace(/<p>/gi, '').replace(/<\\/p>/gi, '\\n\\n')
               .replace(/<h1>/gi, '# ').replace(/<\\/h1>/gi, '\\n')
               .replace(/<h2>/gi, '## ').replace(/<\\/h2>/gi, '\\n')
               .replace(/<h3>/gi, '### ').replace(/<\\/h3>/gi, '\\n')
               .replace(/<strong>/gi, '**').replace(/<\\/strong>/gi, '**')
               .replace(/<b>/gi, '**').replace(/<\\/b>/gi, '**')
               .replace(/<em>/gi, '*').replace(/<\\/em>/gi, '*')
               .replace(/<i>/gi, '*').replace(/<\\/i>/gi, '*')
               .replace(/<code>/gi, '\`').replace(/<\\/code>/gi, '\`')
               .replace(/<a href="([^"]+)">/gi, '[').replace(/<\\/a>/gi, ']($1)')
               .replace(/<li>/gi, '- ').replace(/<\\/li>/gi, '\\n')
               .replace(/<[^>]+>/g, '');
  }

  function updatePreview() {
    content = editor.value;
    const newHtml = marked.parse(content);
    if (preview.innerHTML !== newHtml) {
      preview.innerHTML = newHtml;
    }
    lastPreviewHtml = preview.innerHTML;
    updateStats();
  }

  function updateRawFromPreview() {
    const currentHtml = preview.innerHTML;
    if (currentHtml === lastPreviewHtml) return;
    lastPreviewHtml = currentHtml;
    content = htmlToMarkdown(currentHtml);
    editor.value = content;
    updateStats();
  }

  function updateStats() {
    const mdContent = editor.value;
    const lines = mdContent.split('\\n').length;
    const words = mdContent.trim() ? mdContent.trim().split(/\\s+/).length : 0;
    const chars = mdContent.length;
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

  preview.addEventListener('input', () => {
    clearTimeout(previewSyncTimeout);
    previewSyncTimeout = setTimeout(() => {
      updateRawFromPreview();
      autoSave();
    }, 300);
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

  preview.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch(e.key.toLowerCase()) {
        case 'b': 
          e.preventDefault(); 
          document.execCommand('bold');
          clearTimeout(previewSyncTimeout);
          previewSyncTimeout = setTimeout(() => {
            updateRawFromPreview();
            autoSave();
          }, 300);
          break;
        case 'i': 
          e.preventDefault(); 
          document.execCommand('italic');
          clearTimeout(previewSyncTimeout);
          previewSyncTimeout = setTimeout(() => {
            updateRawFromPreview();
            autoSave();
          }, 300);
          break;
        case 's': 
          e.preventDefault(); 
          save(); 
          break;
      }
    }
  });

  viewMode.addEventListener('change', () => {
    wrap.className = 'editor-wrap ' + viewMode.value;
    const editPane = document.getElementById('edit-pane');
    const previewPane = document.getElementById('preview-pane');
    
    editPane.classList.remove('visible');
    previewPane.classList.remove('visible');
    
    if (viewMode.value === 'split') {
      editPane.classList.add('visible');
      previewPane.classList.add('visible');
      preview.contentEditable = 'true';
      updatePreview();
    } else if (viewMode.value === 'edit') {
      editPane.classList.add('visible');
      preview.contentEditable = 'false';
    } else {
      previewPane.classList.add('visible');
      preview.contentEditable = 'true';
    }
  });

  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg.type === 'setContent') {
      editor.value = msg.content;
      updatePreview();
    }
  });

  preview.contentEditable = 'true';
  vscode.postMessage({ type: 'ready' });
})();`;

  return script;
}
