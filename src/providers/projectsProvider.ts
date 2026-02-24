import * as vscode from 'vscode';
import { ProjectManager } from '../projects/projectManager';
import { LocalGitManager } from '../projects/localGit';

function nameFromPath(p: string) {
  const parts = p.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || p;
}

function buildProjectsHtml(): string {
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
      padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;
      background:var(--vscode-button-background,rgba(0,120,212,.9));
      border:1px solid transparent;
      color:var(--vscode-button-foreground,#fff);white-space:nowrap}
    .tbtn:hover{background:var(--vscode-button-hoverBackground,rgba(0,120,212,1))}
    .btn-sec{
      background:var(--vscode-button-secondaryBackground,rgba(128,128,128,.15));
      color:var(--vscode-editor-foreground)}
    .btn-sec:hover{background:var(--vscode-button-secondaryHoverBackground,rgba(128,128,128,.25))}
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
      display:flex;align-items:center;padding:0 10px;
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
    .btn-sm{padding:2px 6px;font-size:10px}
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
    .git-badge{
      display:inline-block;padding:2px 6px;margin-left:6px;
      font-size:9px;border-radius:3px;
      background:rgba(78,201,176,.2);color:#4EC9B0}
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
  <button class="tbtn" id="btn-add">+ Add Project</button>
  <button class="tbtn btn-sec" id="btn-refresh">↻</button>
  <input id="search" placeholder="Filter projects..." autocomplete="off"/>
</div>
<div id="content">
  <div class="section">
    <div class="section-header">
      <span class="section-title">Projects</span>
      <span id="project-count" class="muted">0</span>
    </div>
    <ul id="project-list" class="project-list"></ul>
    <div id="empty-state" class="empty-state hidden">
      No projects yet. Click "+ Add Project" to add one.
    </div>
  </div>
</div>
<div id="status">
  <span id="st-projects">0 projects</span>
</div>

<script>
(function(){
'use strict';

var vscode = acquireVsCodeApi();
var allProjects = [];
var filterText = '';

var projectList = document.getElementById('project-list');
var emptyState = document.getElementById('empty-state');
var projectCount = document.getElementById('project-count');
var stProjects = document.getElementById('st-projects');

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
          '<div class="project-name">' + esc(pr.name) + (pr.isGit ? '<span class="git-badge">Git</span>' : '') + '</div>' +
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
  projectCount.textContent = count;
  stProjects.textContent = count + ' project' + (count !== 1 ? 's' : '');
}

function updateUI(msg) {
  document.getElementById('loading').classList.add('hidden');
  allProjects = msg.projects || [];
  renderProjects();
}

window.addEventListener('message', function(e) {
  var msg = e.data;
  if (msg.type === 'state') {
    updateUI(msg);
  } else if (msg.type === 'projectAdded') {
    allProjects.push(msg.project);
    renderProjects();
  } else if (msg.type === 'projectRemoved') {
    allProjects = allProjects.filter(function(p) { return p.id !== msg.id; });
    renderProjects();
  }
});

document.getElementById('btn-add').addEventListener('click', function() {
  vscode.postMessage({ type: 'addProject' });
});

document.getElementById('btn-refresh').addEventListener('click', function() {
  document.getElementById('loading').classList.remove('hidden');
  vscode.postMessage({ type: 'refresh' });
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
    if (confirm('Remove this project from the list?')) {
      vscode.postMessage({ type: 'delete', id: id });
    }
  }
});

vscode.postMessage({ type: 'ready' });

})();
</script>
</body>
</html>`;
}

export class ProjectsProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'ultraview.projects';
  private view?: vscode.WebviewView;
  private pm: ProjectManager;
  private lg: LocalGitManager;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.pm = new ProjectManager(context);
    this.lg = new LocalGitManager(this.pm, context);
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = buildProjectsHtml();

    webviewView.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case 'ready':
          this.postState();
          break;
        case 'addProject': {
          const uri = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Select folder for project' });
          if (uri && uri[0]) {
            const folder = uri[0].fsPath;
            const name = await vscode.window.showInputBox({ prompt: 'Project name', value: nameFromPath(folder) });
            if (name !== undefined) {
              const project = this.pm.addProject({ name: name || nameFromPath(folder), path: folder });
              this.postState();
              this.view?.webview.postMessage({ type: 'projectAdded', project });
            }
          }
          break;
        }
        case 'refresh':
          this.postState();
          break;
        case 'delete': {
          const id = msg.id;
          this.pm.removeProject(id);
          this.postState();
          this.view?.webview.postMessage({ type: 'projectRemoved', id });
          break;
        }
        case 'open': {
          const id = msg.id;
          const project = this.pm.listProjects().find(p => p.id === id);
          if (project) {
            const uri = vscode.Uri.file(project.path);
            vscode.commands.executeCommand('vscode.openFolder', uri, false);
          }
          break;
        }
      }
    });

    this.postState();
  }

  postState() {
    if (!this.view) return;
    const projects = this.pm.listProjects();
    this.view.webview.postMessage({ type: 'state', projects });
  }

  static openAsPanel(context: vscode.ExtensionContext) {
    const panel = vscode.window.createWebviewPanel('ultraview.projects.panel', 'Projects', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
    panel.webview.html = buildProjectsHtml();
    
    const pm = new ProjectManager(context);
    panel.webview.onDidReceiveMessage(async msg => {
      switch (msg.type) {
        case 'ready': {
          const projects = pm.listProjects();
          panel.webview.postMessage({ type: 'state', projects });
          break;
        }
        case 'addProject': {
          const uri = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: 'Select folder for project' });
          if (uri && uri[0]) {
            const folder = uri[0].fsPath;
            const name = await vscode.window.showInputBox({ prompt: 'Project name', value: nameFromPath(folder) });
            if (name !== undefined) {
              const project = pm.addProject({ name: name || nameFromPath(folder), path: folder });
              panel.webview.postMessage({ type: 'projectAdded', project });
            }
          }
          break;
        }
        case 'refresh': {
          const projects = pm.listProjects();
          panel.webview.postMessage({ type: 'state', projects });
          break;
        }
        case 'delete': {
          const id = msg.id;
          pm.removeProject(id);
          panel.webview.postMessage({ type: 'projectRemoved', id });
          break;
        }
        case 'open': {
          const id = msg.id;
          const project = pm.listProjects().find(p => p.id === id);
          if (project) {
            const uri = vscode.Uri.file(project.path);
            vscode.commands.executeCommand('vscode.openFolder', uri, false);
          }
          break;
        }
      }
    });
  }
}
