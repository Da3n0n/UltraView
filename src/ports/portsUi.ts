export function buildPortsHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Ports &amp; Processes</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;height:100%;overflow:hidden;
    background:var(--vscode-sideBar-background,var(--vscode-editor-background));
    color:var(--vscode-editor-foreground);
    font:12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  #toolbar{
    position:fixed;top:0;left:0;right:0;height:36px;
    display:flex;align-items:center;gap:6px;padding:0 8px;
    background:var(--vscode-sideBar-background,var(--vscode-editor-background));
    border-bottom:1px solid var(--vscode-panel-border,rgba(128,128,128,.3));
    z-index:10;flex-shrink:0}
  .tbtn{
    padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;
    background:var(--vscode-button-secondaryBackground,rgba(128,128,128,.15));
    border:1px solid var(--vscode-panel-border,rgba(128,128,128,.3));
    color:var(--vscode-editor-foreground);white-space:nowrap}
  .tbtn:hover{background:var(--vscode-list-hoverBackground)}
  .tbtn.active{
    background:var(--vscode-button-background,rgba(0,120,212,.9));
    color:var(--vscode-button-foreground,#fff);
    border-color:transparent}
  #search{
    flex:1;min-width:0;padding:3px 7px;
    background:var(--vscode-input-background);
    color:var(--vscode-input-foreground);
    border:1px solid var(--vscode-input-border,rgba(128,128,128,.4));
    border-radius:4px;font-size:11px}
  #search:focus{outline:1px solid var(--vscode-focusBorder)}
  #content{position:fixed;top:36px;left:0;right:0;bottom:24px;overflow-y:auto;padding:8px}
  #status{
    position:fixed;bottom:0;left:0;right:0;height:24px;
    display:flex;align-items:center;padding:0 10px;
    font-size:10px;color:var(--vscode-descriptionForeground);
    background:var(--vscode-statusBar-background,var(--vscode-sideBar-background));
    border-top:1px solid var(--vscode-panel-border,rgba(128,128,128,.2))}
  .section{margin-bottom:12px}
  .section-title{
    font-size:11px;font-weight:600;opacity:0.7;
    text-transform:uppercase;letter-spacing:0.5px;
    margin-bottom:6px}
  .port-item{
    display:flex;justify-content:space-between;align-items:center;
    padding:8px 10px;margin-bottom:6px;
    background:var(--vscode-editor-background,rgba(30,30,30,.5));
    border:1px solid var(--vscode-panel-border,rgba(128,128,128,.2));
    border-radius:6px;transition:background .15s}
  .port-item:hover{background:var(--vscode-list-hoverBackground,rgba(255,255,255,.05))}
  .port-badge{
    font-family:monospace;font-weight:700;font-size:12px;
    padding:2px 6px;border-radius:4px;flex-shrink:0;
    background:var(--vscode-badge-background,rgba(0,120,212,.8));
    color:var(--vscode-badge-foreground,#fff);
    min-width:52px;text-align:center}
  .port-info{flex:1;min-width:0;margin:0 10px}
  .port-name{
    font-weight:600;font-size:12px;margin-bottom:2px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .port-pid{font-size:10px;color:var(--vscode-descriptionForeground)}
  .btn-danger{
    padding:2px 8px;border-radius:4px;cursor:pointer;font-size:11px;
    background:rgba(204,45,45,.8);color:#fff;
    border:1px solid transparent;white-space:nowrap;flex-shrink:0}
  .btn-danger:hover{background:rgba(204,45,45,1)}
  .btn-danger:disabled{opacity:0.5;cursor:default}
  .empty{
    padding:30px 10px;text-align:center;
    opacity:0.5;font-size:13px}
</style>
</head>
<body>
<div id="toolbar">
  <button class="tbtn" id="btn-refresh" title="Refresh">↻</button>
  <input id="search" placeholder="Filter ports or processes…" autocomplete="off"/>
  <button class="tbtn" id="btn-panel" title="Open as full panel">⬡</button>
</div>
<div id="content">
  <div class="empty">Scanning ports…</div>
</div>
<div id="status">
  <span id="st-count">—</span>
</div>

<script>
(function(){
'use strict';
const vscode = acquireVsCodeApi();
let allPorts = [];
let filterText = '';

document.getElementById('btn-refresh').addEventListener('click', () => {
  document.getElementById('content').innerHTML = '<div class="empty">Scanning…</div>';
  vscode.postMessage({ type: 'refresh' });
});

document.getElementById('btn-panel').addEventListener('click', () => {
  vscode.postMessage({ type: 'openPanel' });
});

document.getElementById('search').addEventListener('input', function() {
  filterText = this.value.toLowerCase();
  render(allPorts);
});

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'state') {
    allPorts = msg.ports || [];
    render(allPorts);
  }
});

function killProcess(pid) {
  const btn = document.getElementById('kill-' + pid);
  if (btn) { btn.textContent = 'Killing…'; btn.disabled = true; }
  vscode.postMessage({ type: 'kill', pid });
}

function render(ports) {
  const q = filterText;
  const visible = q
    ? ports.filter(p => String(p.port).includes(q) || p.name.toLowerCase().includes(q))
    : ports;

  const el = document.getElementById('content');
  const st = document.getElementById('st-count');

  if (!visible || visible.length === 0) {
    el.innerHTML = '<div class="empty">' +
      (ports.length === 0 ? 'No open listening ports found.' : 'No matches for filter.') +
      '</div>';
    st.textContent = ports.length === 0 ? 'No ports' : (visible.length + ' / ' + ports.length + ' ports');
    return;
  }

  el.innerHTML = '';
  const section = document.createElement('div');
  section.className = 'section';
  section.innerHTML = '<div class="section-title">Listening Ports</div>';

  visible.forEach(p => {
    const item = document.createElement('div');
    item.className = 'port-item';
    item.innerHTML =
      '<div class="port-badge">:' + p.port + '</div>' +
      '<div class="port-info">' +
        '<div class="port-name" title="' + escHtml(p.name) + '">' + escHtml(p.name) + '</div>' +
        '<div class="port-pid">PID ' + p.pid + '</div>' +
      '</div>' +
      '<button id="kill-' + p.pid + '" class="btn-danger" onclick="killProcess(' + p.pid + ')">Kill</button>';
    section.appendChild(item);
  });

  el.appendChild(section);
  st.textContent = visible.length + (visible.length === 1 ? ' port' : ' ports') +
    (q ? ' (filtered)' : '');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// expose for inline onclick
window.killProcess = killProcess;

// boot
vscode.postMessage({ type: 'ready' });
})();
</script>
</body>
</html>`;
}
