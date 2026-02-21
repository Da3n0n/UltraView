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
  let currentMode = 'preview'; // 'preview' (RICH), 'split', 'edit' (RAW)
  let lastFocusedArea = 'preview'; // 'editor' or 'preview'

  editor.addEventListener('focus', () => { lastFocusedArea = 'editor'; });
  preview.addEventListener('focus', () => { lastFocusedArea = 'preview'; });

  function isPreviewActive() {
    if (currentMode === 'edit') return false;
    if (currentMode === 'preview') return true;
    return lastFocusedArea === 'preview';
  }

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
    const scrollTop = preview.scrollTop;
    const newHtml = marked.parse(content);
    if (preview.innerHTML !== newHtml) {
      preview.innerHTML = newHtml;
      preview.scrollTop = scrollTop;
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

  // --- Raw textarea operations ---

  function wrapSelection(before, after, placeholder) {
    after = after || before;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const sel = editor.value.substring(start, end) || placeholder || '';
    const replacement = before + sel + after;
    editor.setRangeText(replacement, start, end, 'end');
    editor.focus({ preventScroll: true });
    updatePreview();
    autoSave();
  }

  function insertAtCursor(text, moveCursor) {
    const start = editor.selectionStart;
    editor.setRangeText(text, start, start, 'end');
    if (moveCursor) {
      editor.selectionStart = editor.selectionEnd = start + moveCursor;
    }
    editor.focus({ preventScroll: true });
    updatePreview();
    autoSave();
  }

  function insertLine(prefix) {
    const start = editor.selectionStart;
    const lineStart = editor.value.lastIndexOf('\\n', start - 1) + 1;
    editor.setRangeText(prefix, lineStart, lineStart, 'end');
    editor.focus({ preventScroll: true });
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
    editor.focus({ preventScroll: true });
    updatePreview();
    autoSave();
  }

  // --- Preview (contenteditable) operations ---

  function syncPreviewToEditor() {
    clearTimeout(previewSyncTimeout);
    previewSyncTimeout = setTimeout(() => {
      updateRawFromPreview();
      autoSave();
    }, 100);
  }

  function wrapInPreview(execCmd) {
    preview.focus();
    document.execCommand(execCmd);
    syncPreviewToEditor();
  }

  function formatBlockInPreview(tag) {
    preview.focus();
    document.execCommand('formatBlock', false, tag);
    syncPreviewToEditor();
  }

  function insertHtmlInPreview(html) {
    preview.focus();
    document.execCommand('insertHTML', false, html);
    syncPreviewToEditor();
  }

  function insertCodeInPreview() {
    preview.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const selectedText = range.toString() || 'code';
      const code = document.createElement('code');
      code.textContent = selectedText;
      range.deleteContents();
      range.insertNode(code);
      range.setStartAfter(code);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    syncPreviewToEditor();
  }

  // --- Mode-aware actions ---

  const actions = {
    bold: () => isPreviewActive()
      ? wrapInPreview('bold')
      : wrapSelection('**', '**', 'bold text'),
    italic: () => isPreviewActive()
      ? wrapInPreview('italic')
      : wrapSelection('*', '*', 'italic text'),
    strike: () => isPreviewActive()
      ? wrapInPreview('strikeThrough')
      : wrapSelection('~~', '~~', 'strikethrough'),
    code: () => isPreviewActive()
      ? insertCodeInPreview()
      : wrapSelection('\`', '\`', 'code'),
    h1: () => isPreviewActive() ? formatBlockInPreview('h1') : toggleHeading(1),
    h2: () => isPreviewActive() ? formatBlockInPreview('h2') : toggleHeading(2),
    h3: () => isPreviewActive() ? formatBlockInPreview('h3') : toggleHeading(3),
    h4: () => isPreviewActive() ? formatBlockInPreview('h4') : toggleHeading(4),
    h5: () => isPreviewActive() ? formatBlockInPreview('h5') : toggleHeading(5),
    h6: () => isPreviewActive() ? formatBlockInPreview('h6') : toggleHeading(6),
    ul: () => isPreviewActive()
      ? (() => { preview.focus(); document.execCommand('insertUnorderedList'); syncPreviewToEditor(); })()
      : insertLine('- '),
    ol: () => isPreviewActive()
      ? (() => { preview.focus(); document.execCommand('insertOrderedList'); syncPreviewToEditor(); })()
      : insertLine('1. '),
    task: () => insertLine('- [ ] '),
    quote: () => isPreviewActive()
      ? formatBlockInPreview('blockquote')
      : insertLine('> '),
    link: () => isPreviewActive()
      ? insertHtmlInPreview('<a href="url">link text</a>')
      : wrapSelection('[', '](url)', 'link text'),
    image: () => isPreviewActive()
      ? insertHtmlInPreview('<img src="url" alt="alt text">')
      : insertAtCursor('![alt text](url)', 2),
    hr: () => isPreviewActive()
      ? (() => { preview.focus(); document.execCommand('insertHorizontalRule'); syncPreviewToEditor(); })()
      : insertAtCursor('\\n---\\n'),
    codeblock: () => isPreviewActive()
      ? insertHtmlInPreview('<pre><code>code here</code></pre>')
      : insertAtCursor('\\n\`\`\`\\ncode here\\n\`\`\`\\n', 4),
    table: () => isPreviewActive()
      ? insertHtmlInPreview('<table><thead><tr><th>Header 1</th><th>Header 2</th></tr></thead><tbody><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody></table>')
      : insertAtCursor('\\n| Header 1 | Header 2 |\\n|----------|----------|\\n| Cell 1   | Cell 2   |\\n'),
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
          syncPreviewToEditor();
          break;
        case 'i':
          e.preventDefault();
          document.execCommand('italic');
          syncPreviewToEditor();
          break;
        case 's':
          e.preventDefault();
          save();
          break;
      }
    }
  });

  viewMode.addEventListener('change', () => {
    currentMode = viewMode.value;
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
      editor.focus({ preventScroll: true });
    } else {
      previewPane.classList.add('visible');
      preview.contentEditable = 'true';
      lastFocusedArea = 'preview';
    }
  });

  const styleSelect = document.getElementById('style-select');
  if (styleSelect) {
    styleSelect.addEventListener('change', () => {
      const app = document.getElementById('app');
      if (app) {
        app.className = app.className.replace(/style-\\w+/g, '');
        app.classList.add('style-' + styleSelect.value);
      }
    });
  }

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
