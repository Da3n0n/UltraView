export function buildGitHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
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
    #content{position:fixed;top:36px;left:0;right:0;bottom:0;overflow-y:auto;padding:8px}
    #status{
      position:fixed;bottom:0;left:0;right:0;height:24px;
      display:flex;align-items:center;padding:0 10px;;
      font-size:10px;color:var(--vscode-descriptionForeground);
      background:var(--vscode-statusBar-background,var(--vscode-sideBar-background));
      border-top:1px solid var(--vscode-panel-border,rgba(128,128,128,.2))}
    .section{margin-bottom:12px}
    .section-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
    .section-title{font-size:11px;font-weight:600;opacity:0.7;text-transform:uppercase;letter-spacing:0.5px}
    .muted{color:var(--vscode-descriptionForeground);font-size:11px}
    .btn-action{
      padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;
      background:var(--vscode-button-secondaryBackground,rgba(128,128,128,.15));
      border:1px solid var(--vscode-panel-border,rgba(128,128,128,.3));
      color:var(--vscode-editor-foreground)}
    .btn-action:hover{background:var(--vscode-list-hoverBackground)}
    .btn-primary{
      background:var(--vscode-button-background,rgba(0,120,212,.9));
      color:var(--vscode-button-foreground,#fff);border-color:transparent}
    .btn-primary:hover{background:var(--vscode-button-hoverBackground,rgba(0,120,212,1))}
    .btn-danger{
      background:rgba(204,45,45,.8);color:#fff;border-color:transparent}
    .btn-danger:hover{background:rgba(204,45,45,1)}
    .btn-sm{padding:2px 6px;font-size:10px}
    select{
      padding:4px 6px;border-radius:4px;font-size:11px;
      background:var(--vscode-input-background);
      color:var(--vscode-input-foreground);
      border:1px solid var(--vscode-input-border,rgba(128,128,128,.4))}
    .project-list{list-style:none;padding:0;margin:0}
    .project-item{
      display:flex;justify-content:space-between;align-items:center;
      padding:8px 10px;margin-bottom:6px;
      background:var(--vscode-editor-background,rgba(30,30,30,.5));
      border:1px solid var(--vscode-panel-border,rgba(128,128,128,.2));
      border-radius:6px;transition:background .15s}
    .project-item:hover{background:var(--vscode-list-hoverBackground,rgba(255,255,255,.05))}
    .project-info{flex:1;min-width:0}
    .project-name{font-weight:600;font-size:12px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .project-path{font-size:10px;color:var(--vscode-descriptionForeground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .project-actions{display:flex;gap:4px;flex-shrink:0;margin-left:8px}
    .account-badge{
      display:inline-block;padding:2px 6px;margin-left:6px;
      font-size:9px;border-radius:3px}
    .account-badge.global{background:rgba(0,120,212,.2);color:#4fc1ff}
    .account-badge.local{background:rgba(255,166,0,.2);color:#ffa600}
    .account-item{
      display:flex;justify-content:space-between;align-items:center;
      padding:8px 10px;margin-bottom:6px;
      background:var(--vscode-editor-background,rgba(30,30,30,.5));
      border:1px solid var(--vscode-panel-border,rgba(128,128,128,.2));
      border-radius:6px;transition:background .15s}
    .account-item:hover{background:var(--vscode-list-hoverBackground,rgba(255,255,255,.05))}
    .account-info{flex:1;min-width:0}
    .account-name{font-weight:600;font-size:12px;margin-bottom:2px}
    .account-meta{font-size:10px;color:var(--vscode-descriptionForeground)}
    .account-actions{display:flex;gap:4px;flex-shrink:0;margin-left:8px}
    .empty-state{
      text-align:center;padding:20px;color:var(--vscode-descriptionForeground);
      font-size:11px}
    .loading{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;gap:12px;
      background:var(--vscode-sideBar-background);z-index:20}
    .spinner{width:20px;height:20px;border-radius:50%;border:2px solid var(--vscode-panel-border);
      border-top-color:var(--vscode-textLink-foreground,#4ec9b0);animation:spin .7s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .hidden{display:none !important}
  </style>
</head>
<body>
<div id="loading"><div class="spinner"></div><span>Loading...</span></div>
<div id="toolbar">
  <button class="tbtn" id="btn-add" title="Add new project">+ Add</button>
  <button class="tbtn" id="btn-refresh" title="Refresh list">↻</button>
  <input id="search" placeholder="Filter projects..." autocomplete="off"/>
  <button class="tbtn" id="btn-accounts" title="Manage accounts">⚡ Accounts</button>
</div>
<div id="content">
  <div class="section">
    <div class="section-header">
      <span class="section-title">Active Workspace</span>
    </div>
    <div id="active-workspace" class="muted">—</div>
  </div>

  <div class="section" id="accounts-section">
    <div class="section-header">
      <span class="section-title">Git Account</span>
      <button class="btn-action btn-sm" id="btn-add-account">+ Add</button>
    </div>
    <div id="active-account" class="muted" style="margin-bottom:8px">—</div>
    <div id="account-list"></div>
  </div>

  <div class="section">
    <div class="section-header">
      <span class="section-title">Projects</span>
      <button class="btn-action btn-sm" id="btn-add-project">+ Add Current</button>
    </div>
    <ul id="project-list" class="project-list"></ul>
    <div id="empty-state" class="empty-state hidden">
      No projects yet. Click "+ Add" to add a project.
    </div>
  </div>
</div>
<div id="status">
  <span id="st-projects">0 projects</span>
  <span id="st-account"></span>
</div>

<script>
(function(){
'use strict';

var vscode = acquireVsCodeApi();
var allProjects = [];
var filterText = '';
var allAccounts = [];
var globalAccount = null;
var localAccount = null;
var allSshKeys = [];

var projectList = document.getElementById('project-list');
var emptyState = document.getElementById('empty-state');
var stProjects = document.getElementById('st-projects');
var activeWorkspace = document.getElementById('active-workspace');
var accountList = document.getElementById('account-list');
var activeAccountEl = document.getElementById('active-account');
var stAccount = document.getElementById('st-account');

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderProjects() {
  var q = filterText.toLowerCase();
  var filtered = allProjects.filter(function(p) { 
    return !q || p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q);
  });
  
  projectList.innerHTML = '';
  
  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    if (allProjects.length > 0 && q) {
      emptyState.textContent = 'No projects match "' + esc(q) + '"';
    }
  } else {
    emptyState.classList.add('hidden');
    filtered.forEach(function(pr) {
      var li = document.createElement('li');
      li.className = 'project-item';
      li.innerHTML =
        '<div class="project-info">' +
          '<div class="project-name">' + esc(pr.name) + '</div>' +
          '<div class="project-path">' + esc(pr.path) + '</div>' +
        '</div>' +
        '<div class="project-actions">' +
          '<button class="btn-action btn-sm" data-action="open" data-id="' + esc(pr.id) + '">Open</button>' +
          '<button class="btn-action btn-sm" data-action="delete" data-id="' + esc(pr.id) + '">×</button>' +
        '</div>';
      projectList.appendChild(li);
    });
  }
  
  var count = filtered.length;
  stProjects.textContent = count + ' project' + (count !== 1 ? 's' : '');
}

function renderAccounts() {
  var effectiveAccount = localAccount || globalAccount;
  if (effectiveAccount) {
    var acc = effectiveAccount;
    var scope = localAccount ? 'local' : 'global';
    activeAccountEl.innerHTML = '<span class="account-name">' + esc(acc.username) + '</span>' +
      '<span class="account-badge ' + scope + '">' + esc(acc.provider) + ' (' + scope + ')</span>';
    stAccount.textContent = 'Account: ' + esc(acc.username);
  } else {
    activeAccountEl.textContent = 'No account set';
    stAccount.textContent = 'No account';
  }
  
  accountList.innerHTML = '';
  allAccounts.forEach(function(acc) {
    var isGlobal = globalAccount && globalAccount.id === acc.id;
    var isLocal = localAccount && localAccount.id === acc.id;
    var isEffective = isGlobal || isLocal;
    var sshKey = allSshKeys.find(function(k) { return k.accountId === acc.id; });
    var div = document.createElement('div');
    div.className = 'account-item' + (isEffective ? ' style="border-color:var(--vscode-focusBorder,rgba(0,120,212,.5));background:rgba(0,120,212,.08)"' : '');
    var badges = '';
    if (isGlobal) badges += '<span class="account-badge global">✓ global</span>';
    if (isLocal) badges += '<span class="account-badge local">✓ local</span>';
    div.innerHTML = 
      '<div class="account-info">' +
        '<div class="account-name">' + esc(acc.username) + 
          '<span class="account-badge" style="background:rgba(128,128,128,.2)">' + esc(acc.provider) + '</span>' +
          badges +
        '</div>' +
        '<div class="account-meta">' + 
          (acc.token ? '✓ Token' : '✗ No token') + ' | ' +
          (sshKey ? '✓ SSH key' : '✗ No SSH') +
        '</div>' +
      '</div>' +
      '<div class="account-actions">' +
        '<button class="btn-action btn-sm" data-action="ssh" data-id="' + esc(acc.id) + '">SSH</button>' +
        '<button class="btn-action btn-sm" data-action="token" data-id="' + esc(acc.id) + '">Token</button>' +
        (isGlobal ? '<button class="btn-action btn-sm" data-action="unsetGlobal" data-id="' + esc(acc.id) + '" title="Unset global">✗ Global</button>' : '<button class="btn-action btn-sm" data-action="setGlobal" data-id="' + esc(acc.id) + '" title="Set as global">⬤ Global</button>') +
        (isLocal ? '<button class="btn-action btn-sm" data-action="unsetLocal" data-id="' + esc(acc.id) + '" title="Unset local">✗ Local</button>' : '<button class="btn-action btn-sm" data-action="setLocal" data-id="' + esc(acc.id) + '" title="Set for this workspace">⬤ Local</button>') +
        '<button class="btn-action btn-sm" data-action="delete" data-id="' + esc(acc.id) + '">×</button>' +
      '</div>';
    accountList.appendChild(div);
  });
}

function updateUI(msg) {
  document.getElementById('loading').classList.add('hidden');

  allProjects = msg.projects || [];
  allAccounts = msg.accounts || [];
  globalAccount = msg.globalAccount || null;
  localAccount = msg.localAccount || null;
  allSshKeys = msg.sshKeys || [];
  window.activeRepo = msg.activeRepo || '';

  activeWorkspace.textContent = msg.activeRepo || '—';

  renderProjects();
  renderAccounts();
}

window.addEventListener('message', function(e) {
  var msg = e.data;
  if (msg.type === 'state') {
    updateUI(msg);
  } else if (msg.type === 'projectAdded') {
    vscode.postMessage({ type: 'refresh' });
  } else if (msg.type === 'projectRemoved') {
    vscode.postMessage({ type: 'refresh' });
  } else if (msg.type === 'accountAdded') {
    vscode.postMessage({ type: 'getAccounts' });
  } else if (msg.type === 'accountRemoved') {
    vscode.postMessage({ type: 'getAccounts' });
  } else if (msg.type === 'accountUpdated') {
    vscode.postMessage({ type: 'getAccounts' });
  } else if (msg.type === 'sshKeyGenerated') {
    vscode.postMessage({ type: 'getAccounts' });
  }
});

document.getElementById('btn-add').addEventListener('click', function() {
  vscode.postMessage({ type: 'addProject' });
});

document.getElementById('btn-add-project').addEventListener('click', function() {
  vscode.postMessage({ type: 'addCurrentProject' });
});

document.getElementById('btn-refresh').addEventListener('click', function() {
  document.getElementById('loading').classList.remove('hidden');
  vscode.postMessage({ type: 'refresh' });
});

document.getElementById('btn-accounts').addEventListener('click', function() {
  var section = document.getElementById('accounts-section');
  section.scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('btn-add-account').addEventListener('click', function() {
  vscode.postMessage({ type: 'addAccount' });
});

document.getElementById('search').addEventListener('input', function() {
  filterText = this.value;
  renderProjects();
});

projectList.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  
  var action = btn.dataset.action;
  var id = btn.dataset.id;
  
  if (action === 'open') {
    vscode.postMessage({ type: 'open', id: id });
  } else if (action === 'delete') {
    vscode.postMessage({ type: 'delete', id: id });
  }
});

accountList.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  
  var action = btn.dataset.action;
  var id = btn.dataset.id;
  
  if (action === 'ssh') {
    vscode.postMessage({ type: 'generateSshKey', accountId: id });
  } else if (action === 'token') {
    vscode.postMessage({ type: 'addToken', accountId: id });
  } else if (action === 'setGlobal') {
    vscode.postMessage({ type: 'setGlobalAccount', accountId: id });
  } else if (action === 'unsetGlobal') {
    vscode.postMessage({ type: 'setGlobalAccount', accountId: null });
  } else if (action === 'setLocal') {
    vscode.postMessage({ type: 'setLocalAccount', workspaceUri: window.activeRepo, accountId: id });
  } else if (action === 'unsetLocal') {
    vscode.postMessage({ type: 'setLocalAccount', workspaceUri: window.activeRepo, accountId: null });
  } else if (action === 'delete') {
    vscode.postMessage({ type: 'removeAccount', accountId: id });
  }
});

vscode.postMessage({ type: 'ready' });

})();
</script>
</body>
</html>`;
}
