export function getEditorStyles(): string {
  return /* css */`
:root {
  --bg: var(--vscode-editor-background);
  --surface: var(--vscode-sideBar-background, var(--vscode-editor-background));
  --surface2: var(--vscode-list-hoverBackground, rgba(128,128,128,0.1));
  --border: var(--vscode-panel-border, rgba(128,128,128,0.35));
  --text: var(--vscode-editor-foreground);
  --muted: var(--vscode-descriptionForeground);
  --accent: var(--vscode-textLink-foreground, var(--vscode-button-background));
  --green: var(--vscode-terminal-ansiGreen, #4ec9b0);
  --code-bg: var(--vscode-input-background, var(--vscode-editor-background));
  --toolbar-bg: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
  --radius: 6px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow: hidden; }

#app { display: flex; flex-direction: column; height: 100vh; }

.toolbar {
  display: flex; align-items: center; gap: 2px;
  padding: 6px 10px; background: var(--toolbar-bg);
  border-bottom: 1px solid var(--border); flex-wrap: wrap;
  position: sticky; top: 0; z-index: 100;
}
.toolbar-group { display: flex; align-items: center; gap: 2px; }
.toolbar-divider { width: 1px; height: 20px; background: var(--border); margin: 0 6px; }

.toolbar-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; background: transparent;
  border: none; border-radius: 4px; cursor: pointer;
  color: var(--text); font-size: 14px; transition: background 0.15s;
}
.toolbar-btn:hover { background: var(--surface2); }
.toolbar-btn:active { background: var(--border); }
.toolbar-btn.active { background: var(--surface2); color: var(--accent); }

.toolbar-select {
  height: 28px; padding: 0 8px; background: var(--surface2);
  border: 1px solid var(--border); border-radius: 4px;
  color: var(--text); font-size: 12px; cursor: pointer;
}
.toolbar-select:hover { border-color: var(--accent); }

.editor-wrap { flex: 1; display: flex; overflow: hidden; position: relative; min-height: 0; }
.editor-pane { flex: 1 1 50%; display: none; overflow: hidden; min-width: 0; }
.editor-pane.visible { display: flex; flex-direction: column; }
.split .editor-pane { display: flex; flex-direction: column; flex: 1 1 50%; }

#editor {
  flex: 1; width: 100%; resize: none; border: none;
  background: var(--bg); color: var(--text);
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 14px; line-height: 1.7; padding: 20px;
  outline: none; tab-size: 2;
}

#preview {
  flex: 1; width: 100%; overflow-y: auto; padding: 20px 40px 80px;
}

.split .editor-pane:first-child { border-right: 1px solid var(--border); }

h1,h2,h3,h4,h5,h6 { color: var(--accent); margin: 1.5em 0 0.5em; font-weight: 600; line-height: 1.3; }
h1 { font-size: 2rem; border-bottom: 1px solid var(--border); padding-bottom: 0.4em; }
h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
h3 { font-size: 1.2rem; }
p { line-height: 1.8; margin: 0.8em 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code { background: var(--code-bg); padding: 2px 6px; border-radius: 4px; font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size: 0.88em; color: var(--green); }
pre { background: var(--code-bg); padding: 16px; border-radius: 8px; overflow-x: auto; margin: 1em 0; border: 1px solid var(--border); }
pre code { padding: 0; background: none; color: inherit; }
blockquote { border-left: 3px solid var(--accent); margin: 1em 0; padding: 8px 16px; background: var(--surface); border-radius: 0 6px 6px 0; color: var(--muted); }
table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 0.92em; }
th { background: var(--surface); color: var(--accent); text-align: left; padding: 8px 12px; border: 1px solid var(--border); font-weight: 600; }
td { padding: 7px 12px; border: 1px solid var(--border); }
tr:nth-child(even) td { background: rgba(255,255,255,0.03); }
ul, ol { margin: 0.8em 0 0.8em 1.6em; line-height: 1.8; }
li { margin: 0.2em 0; }
hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }
img { max-width: 100%; border-radius: 6px; }
input[type=checkbox] { margin-right: 6px; }

.status-bar {
  display: flex; align-items: center; gap: 16px;
  padding: 4px 12px; background: var(--toolbar-bg);
  border-top: 1px solid var(--border); font-size: 11px; color: var(--muted);
}
.status-bar span { display: flex; align-items: center; gap: 4px; }

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted); }

.dropdown { position: relative; display: inline-block; }
.dropdown-content {
  display: none; position: absolute; top: 100%; left: 0;
  background: var(--toolbar-bg); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  min-width: 120px; z-index: 200; margin-top: 2px;
}
.dropdown:hover .dropdown-content { display: block; }
.dropdown-item {
  display: block; width: 100%; padding: 6px 12px;
  background: none; border: none; color: var(--text);
  text-align: left; font-size: 12px; cursor: pointer;
}
.dropdown-item:hover { background: var(--surface2); }
.dropdown-item.heading { font-weight: 600; }

@media (max-width: 600px) {
  .split .editor-pane { flex: none; width: 100% !important; }
  .split .editor-pane:first-child { border-right: none; border-bottom: 1px solid var(--border); }
  .split { flex-direction: column; }
}`;
}

export function getEditorHtml(): string {
  return /* html */`
<div id="app">
  <div class="toolbar">
    <div class="toolbar-group">
      <div class="dropdown">
        <button class="toolbar-btn" title="Headings">H</button>
        <div class="dropdown-content">
          <button class="dropdown-item heading" data-action="h1">Heading 1</button>
          <button class="dropdown-item heading" data-action="h2">Heading 2</button>
          <button class="dropdown-item heading" data-action="h3">Heading 3</button>
          <button class="dropdown-item" data-action="h4">Heading 4</button>
          <button class="dropdown-item" data-action="h5">Heading 5</button>
          <button class="dropdown-item" data-action="h6">Heading 6</button>
        </div>
      </div>
    </div>
    <div class="toolbar-divider"></div>
    <div class="toolbar-group">
      <button class="toolbar-btn" data-action="bold" title="Bold (Ctrl+B)"><b>B</b></button>
      <button class="toolbar-btn" data-action="italic" title="Italic (Ctrl+I)"><i>I</i></button>
      <button class="toolbar-btn" data-action="strike" title="Strikethrough"><s>S</s></button>
      <button class="toolbar-btn" data-action="code" title="Inline Code">&lt;/&gt;</button>
    </div>
    <div class="toolbar-divider"></div>
    <div class="toolbar-group">
      <button class="toolbar-btn" data-action="ul" title="Bullet List">&#8226;</button>
      <button class="toolbar-btn" data-action="ol" title="Numbered List">1.</button>
      <button class="toolbar-btn" data-action="task" title="Task List">&#9744;</button>
      <button class="toolbar-btn" data-action="quote" title="Blockquote">&quot;</button>
    </div>
    <div class="toolbar-divider"></div>
    <div class="toolbar-group">
      <button class="toolbar-btn" data-action="link" title="Link">&#128279;</button>
      <button class="toolbar-btn" data-action="image" title="Image">&#128247;</button>
      <button class="toolbar-btn" data-action="hr" title="Horizontal Rule">&#8212;</button>
    </div>
    <div class="toolbar-divider"></div>
    <div class="toolbar-group">
      <button class="toolbar-btn" data-action="codeblock" title="Code Block">{ }</button>
      <button class="toolbar-btn" data-action="table" title="Table">&#8862;</button>
    </div>
    <div class="toolbar-divider"></div>
    <div class="toolbar-group" style="margin-left: auto;">
      <select class="toolbar-select" id="view-mode">
        <option value="split">Split View</option>
        <option value="edit">Edit Only</option>
        <option value="preview">Preview Only</option>
      </select>
    </div>
  </div>

  <div class="editor-wrap split" id="editor-wrap">
    <div class="editor-pane visible" id="edit-pane">
      <textarea id="editor" placeholder="Start writing..." spellcheck="false"></textarea>
    </div>
    <div class="editor-pane visible" id="preview-pane">
      <div id="preview"></div>
    </div>
  </div>

  <div class="status-bar">
    <span id="stat-lines">Lines: 0</span>
    <span id="stat-words">Words: 0</span>
    <span id="stat-chars">Chars: 0</span>
    <span style="margin-left:auto;">Markdown Editor</span>
  </div>
</div>`;
}
