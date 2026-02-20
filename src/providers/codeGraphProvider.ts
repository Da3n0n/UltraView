import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { buildCodeGraph } from '../codenode';
import { defaultCodeGraphSettings } from '../settings';

// ─── Types ──────────────────────────────────────────────────────────────────

interface GNode {
  id: string;
  label: string;
  type: 'ts' | 'md' | 'other' | 'fn';
  filePath: string;
  parentId?: string;    // for function nodes, parent file id
}

interface GEdge {
  source: string;
  target: string;
  kind: 'import' | 'link';
}

interface GraphData {
  nodes: GNode[];
  edges: GEdge[];
}

// ─── Parser ──────────────────────────────────────────────────────────────────

const IMPORT_RE = /(?:import|require)\s*(?:[^'"]*from\s*)?['"]([^'"]+)['"]/g;
const WIKILINK_RE = /\[\[([^\]|#]+?)(?:[|#][^\]]*)?\]\]/g;
const MDLINK_RE  = /\[(?:[^\]]*)\]\(([^)]+)\)/g;
const FN_RE = /export\s+(?:async\s+)?(?:function|class)\s+(\w+)|export\s+const\s+(\w+)\s*[=:]/g;

function resolveImport(fromFile: string, imp: string, allFiles: Set<string>): string | null {
  if (imp.startsWith('.')) {
    const dir = path.dirname(fromFile);
    const base = path.resolve(dir, imp);
    for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js']) {
      const candidate = base + ext;
      if (allFiles.has(candidate)) return candidate;
    }
  }
  return null;
}

function resolveMdLink(fromFile: string, link: string, allFiles: Set<string>): string | null {
  if (link.startsWith('http') || link.startsWith('#')) return null;
  const dir = path.dirname(fromFile);
  const candidate = path.resolve(dir, link.split('#')[0]);
  if (allFiles.has(candidate)) return candidate;
  return null;
}

function resolveWikiLink(fromFile: string, name: string, allFiles: Set<string>): string | null {
  const lower = name.toLowerCase();
  for (const f of allFiles) {
    const base = path.basename(f, path.extname(f)).toLowerCase();
    if (base === lower) return f;
  }
  return null;
}

async function buildGraph(includeFns: boolean): Promise<GraphData> {
  // Use the new universal code graph builder
  const cg = await buildCodeGraph();
  // Map CodeNode/CodeEdge to GNode/GEdge for the view
  const nodes: GNode[] = cg.nodes.map(n => ({
    id: n.id,
    label: n.label,
    type: n.type === 'fn' ? 'fn' : n.type === 'md' ? 'md' : n.type === 'db' ? 'other' : (['ts','js','tsx','jsx'].includes(n.type) ? 'ts' : 'other'),
    filePath: n.filePath ?? '',
    parentId: (n.meta && typeof n.meta.parent === 'string') ? n.meta.parent : undefined
  }));
  const edges: GEdge[] = cg.edges.map(e => ({
    source: e.source,
    target: e.target,
    kind: e.kind === 'import' || e.kind === 'declares' ? 'import' : 'link'
  }));
  return { nodes, edges };
}

// ─── HTML ────────────────────────────────────────────────────────────────────

function buildHtml(wsPath: string): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Code Graph</title>
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
  #search{
    flex:1;min-width:0;padding:3px 7px;
    background:var(--vscode-input-background);
    color:var(--vscode-input-foreground);
    border:1px solid var(--vscode-input-border,rgba(128,128,128,.4));
    border-radius:4px;font-size:11px}
  #search:focus{outline:1px solid var(--vscode-focusBorder)}
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
  #canvas-wrap{position:fixed;top:36px;left:0;right:0;bottom:24px}
  #c{display:block;width:100%;height:100%}
  #status{
    position:fixed;bottom:0;left:0;right:0;height:24px;
    display:flex;align-items:center;padding:0 10px;gap:16px;
    font-size:10px;color:var(--vscode-descriptionForeground);
    background:var(--vscode-statusBar-background,var(--vscode-sideBar-background));
    border-top:1px solid var(--vscode-panel-border,rgba(128,128,128,.2))}
  #tooltip{
    position:fixed;pointer-events:none;display:none;max-width:320px;
    padding:6px 10px;border-radius:5px;font-size:11px;line-height:1.5;
    background:var(--vscode-editorHoverWidget-background,#252526);
    border:1px solid var(--vscode-editorHoverWidget-border,rgba(128,128,128,.4));
    color:var(--vscode-editorHoverWidget-foreground,#ccc);z-index:20}
  #loading{
    position:fixed;inset:0;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:12px;
    background:var(--vscode-sideBar-background,var(--vscode-editor-background));z-index:30}
  .spinner{
    width:28px;height:28px;border-radius:50%;
    border:3px solid var(--vscode-panel-border,rgba(128,128,128,.3));
    border-top-color:var(--vscode-textLink-foreground,#4ec9b0);
    animation:spin .7s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  #legend{
    position:fixed;bottom:28px;right:8px;display:flex;flex-direction:column;
    gap:4px;font-size:11px;color:var(--vscode-descriptionForeground);
    background:var(--vscode-sideBar-background,rgba(30,30,30,.9));
    padding:8px;border-radius:8px;
    border:1px solid var(--vscode-panel-border,rgba(128,128,128,.25));
    min-width:130px}
  .leg{display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 6px;border-radius:4px}
  .leg:hover,.leg.active{background:var(--vscode-list-hoverBackground,rgba(255,255,255,.1))}
  .dot{width:14px;height:14px;border-radius:50%;flex-shrink:0;border:1.5px solid rgba(255,255,255,.25)}
  #color-picker-popup{
    position:fixed;display:none;flex-direction:column;gap:8px;
    background:var(--vscode-editor-background,var(--vscode-sideBar-background,#1e1e1e));
    border:1px solid var(--vscode-panel-border,rgba(128,128,128,.4));
    border-radius:6px;padding:10px;box-shadow:0 4px 16px rgba(0,0,0,.4);
    z-index:1000;min-width:200px}
  .picker-row{display:flex;align-items:center;gap:10px;margin-bottom:6px}
  .picker-row label{flex:1;font-size:12px;color:var(--vscode-editor-foreground,#ccc)}
  .picker-row input[type="text"]{
    width:80px;padding:4px 8px;font-size:12px;font-family:monospace;
    background:var(--vscode-input-background,#252526);
    border:1px solid var(--vscode-input-border,rgba(128,128,128,.4));
    border-radius:3px;color:var(--vscode-input-foreground,#ccc)}
  .picker-row input[type="color"]{
    width:32px;height:32px;padding:0;border:none;cursor:pointer;
    background:transparent;border-radius:4px}
  .color-preview{
    width:100%;height:30px;border-radius:4px;border:1px solid rgba(128,128,128,.3);
    margin-bottom:6px}
  #btn-settings{
    margin-left:auto;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;
    background:var(--vscode-button-secondaryBackground,rgba(128,128,128,.15));
    border:1px solid var(--vscode-panel-border,rgba(128,128,128,.3));
    color:var(--vscode-editor-foreground)}
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div><span>Scanning workspace…</span></div>
<div id="toolbar">
  <button class="tbtn" id="btn-refresh" title="Refresh graph">↻</button>
  <button class="tbtn" id="btn-fit"     title="Fit to screen">⊡</button>
  <button class="tbtn" id="btn-fns"     title="Toggle function nodes">ƒ( )</button>
  <input id="search" placeholder="Filter nodes…" autocomplete="off"/>
  <button class="tbtn" id="btn-panel"   title="Open as full panel">⬡</button>
  <button id="btn-settings" title="Open Settings">⚙</button>
</div>
<div id="canvas-wrap"><canvas id="c"></canvas></div>
<div id="status">
  <span id="st-nodes">0 nodes</span>
  <span id="st-edges">0 edges</span>
  <span id="st-selected"></span>
</div>
<div id="tooltip"></div>
<div id="legend">
  <div class="leg" data-type="ts"><div class="dot" style="background:#4EC9B0"></div><span>TypeScript</span></div>
  <div class="leg" data-type="other"><div class="dot" style="background:#9CDCFE"></div><span>JavaScript</span></div>
  <div class="leg" data-type="md"><div class="dot" style="background:#C586C0"></div><span>Markdown</span></div>
  <div class="leg" data-type="fn"><div class="dot" style="background:#DCDCAA"></div><span>Function</span></div>
</div>
<div id="color-picker-popup">
  <div class="color-preview" id="color-preview"></div>
  <div class="picker-row">
    <label>Color</label>
    <input type="text" id="color-hex-input" maxlength="7">
    <input type="color" id="color-native-input" value="#4EC9B0">
  </div>
</div>

<script>
(function(){
'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
let COLORS = {
  ts:    '#4EC9B0',
  other: '#9CDCFE',
  md:    '#C586C0',
  fn:    '#DCDCAA',
  edge_import: 'rgba(78,201,176,0.25)',
  edge_link:   'rgba(197,134,192,0.30)',
  selected: '#FFFFFF',
  hovered:  'rgba(255,255,255,0.85)',
};
const RADIUS = { ts: 9, other: 8, md: 9, fn: 6 };
const REPULSION   = 9000;
const SPRING_LEN  = { import: 130, link: 150, fn: 55 };
const SPRING_K    = 0.20;
const DAMPING     = 0.65;
const CENTER_K    = 0.008;
const REPEL_CUTOFF= 350;
const ALPHA_DECAY = 0.994;
const MIN_ALPHA   = 0.001;

// ── State ────────────────────────────────────────────────────────────────────
let nodes = [];   // { id, label, type, filePath, x, y, vx, vy, r, col, parentId?, pinned? }
let edges = [];   // { si, ti, kind }
let camera = { x: 0, y: 0, zoom: 1 };
let alpha  = 1.0;
let rafId  = null;
let hovered = -1;
let selected = -1;
let filterText = '';
let showFns  = false;
let allNodes = [];  // full unfiltered
let allEdges = [];
let pressing = false;
let panStart = null;
let dragNode = -1;
let lastMouse = { x: 0, y: 0 };
let simRunning = false;

const vscode = acquireVsCodeApi();
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');

// ── Resize ───────────────────────────────────────────────────────────────────
function resize(){
  const wrap = document.getElementById('canvas-wrap');
  canvas.width  = wrap.clientWidth  * devicePixelRatio;
  canvas.height = wrap.clientHeight * devicePixelRatio;
  canvas.style.width  = wrap.clientWidth  + 'px';
  canvas.style.height = wrap.clientHeight + 'px';
  render();
}
window.addEventListener('resize', resize);

// ── Load graph data ──────────────────────────────────────────────────────────
window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'graphData') {
    if (msg.colors) {
      COLORS = { ...COLORS, ...msg.colors };
      updateLegendColors();
    }
    loadGraph(msg.nodes, msg.edges);
    document.getElementById('loading').style.display = 'none';
  }
});

function updateLegendColors() {
  document.querySelectorAll('.leg').forEach(leg => {
    const type = leg.dataset.type;
    const dot = leg.querySelector('.dot');
    if (dot && COLORS[type]) {
      dot.style.background = COLORS[type];
    }
  });
}

function loadGraph(rawNodes, rawEdges) {
  allNodes = rawNodes;
  allEdges = rawEdges;
  applyFilter();
}

function applyFilter() {
  const q = filterText.toLowerCase();

  let visNodes = allNodes.filter(n => {
    if (!showFns && n.type === 'fn') return false;
    if (q && !n.label.toLowerCase().includes(q) && !n.filePath.toLowerCase().includes(q)) return false;
    return true;
  });

  const visIds = new Set(visNodes.map(n => n.id));
  let visEdges = allEdges.filter(e => visIds.has(e.source) && visIds.has(e.target));

  // Build index
  const idxMap = new Map();
  visNodes.forEach((n, i) => idxMap.set(n.id, i));

  // Position: keep old positions if node existed
  const oldById = new Map(nodes.map(n => [n.id, n]));

  nodes = visNodes.map((n, i) => {
    const old = oldById.get(n.id);
    const angle = (i / visNodes.length) * Math.PI * 2;
    const spread = Math.sqrt(visNodes.length) * 60;
    return {
      id: n.id,
      label: n.label,
      type: n.type,
      filePath: n.filePath,
      parentId: n.parentId,
      x: old ? old.x : Math.cos(angle) * spread * (0.5 + Math.random() * 0.5),
      y: old ? old.y : Math.sin(angle) * spread * (0.5 + Math.random() * 0.5),
      vx: 0, vy: 0,
      r: RADIUS[n.type] || 8,
      col: COLORS[n.type] || '#858585',
      pinned: false,
    };
  });

  edges = visEdges
    .map(e => ({ si: idxMap.get(e.source), ti: idxMap.get(e.target), kind: e.kind }))
    .filter(e => e.si !== undefined && e.ti !== undefined);

  hovered = -1;
  selected = -1;
  alpha = 1.0;
  updateStatus();

  if (!simRunning) {
    simRunning = true;
    rafId = requestAnimationFrame(tick);
  }
}

// ── Simulation ───────────────────────────────────────────────────────────────
function tick() {
  if (alpha > MIN_ALPHA) {
    simulate();
    alpha *= ALPHA_DECAY;
  }
  render();
  rafId = requestAnimationFrame(tick);
}

function simulate() {
  const n = nodes.length;
  const a = alpha;

  // Repulsion (O(n²) with cutoff — fast for <2000 nodes)
  for (let i = 0; i < n; i++) {
    const ni = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const nj = nodes[j];
      const dx = nj.x - ni.x;
      const dy = nj.y - ni.y;
      const d2 = dx * dx + dy * dy || 0.01;
      const d  = Math.sqrt(d2);
      if (d > REPEL_CUTOFF) continue;
      const f = (REPULSION / d2) * a;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      ni.vx -= fx; ni.vy -= fy;
      nj.vx += fx; nj.vy += fy;
    }
  }

  // Spring forces
  for (const e of edges) {
    const A = nodes[e.si];
    const B = nodes[e.ti];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const d  = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const nat = SPRING_LEN[e.kind] ?? 130;
    const f = (d - nat) * SPRING_K * a;
    const fx = (dx / d) * f, fy = (dy / d) * f;
    A.vx += fx; A.vy += fy;
    B.vx -= fx; B.vy -= fy;
  }

  // Centering + integrate
  for (const nd of nodes) {
    if (nd.pinned) continue;
    nd.vx = (nd.vx - nd.x * CENTER_K * a) * DAMPING;
    nd.vy = (nd.vy - nd.y * CENTER_K * a) * DAMPING;
    nd.x += nd.vx;
    nd.y += nd.vy;
  }
}

// ── Render ───────────────────────────────────────────────────────────────────
function worldToScreen(wx, wy) {
  const cx = canvas.width  / 2 + camera.x * devicePixelRatio;
  const cy = canvas.height / 2 + camera.y * devicePixelRatio;
  return [cx + wx * camera.zoom * devicePixelRatio,
          cy + wy * camera.zoom * devicePixelRatio];
}

function render() {
  const dpr = devicePixelRatio;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W / 2 + camera.x * dpr, H / 2 + camera.y * dpr);
  const z = camera.zoom * dpr;
  ctx.scale(z, z);

  // Edges
  for (const e of edges) {
    const A = nodes[e.si], B = nodes[e.ti];
    const isSel = (e.si === selected || e.ti === selected);
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.strokeStyle = isSel
      ? (e.kind === 'import' ? 'rgba(78,201,176,0.75)' : 'rgba(197,134,192,0.75)')
      : COLORS['edge_' + e.kind];
    ctx.lineWidth = isSel ? 1.5 / z : 0.8 / z;
    ctx.stroke();
  }

  // Nodes
  const labelScale = Math.max(0.6, Math.min(1.2, 1 / camera.zoom));
  const showLabel = camera.zoom > 0.25;

  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i];
    const isSel = i === selected;
    const isHov = i === hovered;

    // Glow for selected
    if (isSel) {
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, nd.r + 5 / z, 0, Math.PI * 2);
      ctx.fillStyle = nd.col + '33';
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(nd.x, nd.y, nd.r, 0, Math.PI * 2);
    ctx.fillStyle = nd.col;
    ctx.globalAlpha = (filterText && !nd.label.toLowerCase().includes(filterText.toLowerCase())) ? 0.25 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;

    if (isSel || isHov) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5 / z;
      ctx.stroke();
    }

    // Label
    if (showLabel) {
      ctx.save();
      ctx.scale(labelScale, labelScale);
      const sx = nd.x / labelScale;
      const sy = nd.y / labelScale;
      ctx.font = (nd.type === 'fn' ? 9 : 10) + 'px -apple-system,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(220,220,220,0.85)';
      ctx.fillText(nd.label, sx, sy + (nd.r + 11) / labelScale);
      ctx.restore();
    }
  }

  ctx.restore();
}

// ── Status ───────────────────────────────────────────────────────────────────
function updateStatus() {
  document.getElementById('st-nodes').textContent = nodes.length + ' nodes';
  document.getElementById('st-edges').textContent = edges.length + ' edges';
}

// ── Hit test ─────────────────────────────────────────────────────────────────
function hitNode(mx, my) {
  // mx, my in CSS pixels (from mouse event)
  const dpr = devicePixelRatio;
  const cx  = canvas.width  / 2 / dpr + camera.x;
  const cy  = canvas.height / 2 / dpr + camera.y;
  for (let i = nodes.length - 1; i >= 0; i--) {
    const nd = nodes[i];
    const sx = cx + nd.x * camera.zoom;
    const sy = cy + nd.y * camera.zoom;
    const r  = nd.r * camera.zoom + 4;
    const dx = mx - sx, dy = my - sy;
    if (dx * dx + dy * dy <= r * r) return i;
  }
  return -1;
}

// ── Mouse events ─────────────────────────────────────────────────────────────
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  lastMouse = { x: mx, y: my };

  if (dragNode >= 0) {
    const dpr = devicePixelRatio;
    const cx  = canvas.width  / 2 / dpr + camera.x;
    const cy  = canvas.height / 2 / dpr + camera.y;
    nodes[dragNode].x = (mx - cx) / camera.zoom;
    nodes[dragNode].y = (my - cy) / camera.zoom;
    nodes[dragNode].vx = 0;
    nodes[dragNode].vy = 0;
    alpha = Math.max(alpha, 0.3);
    return;
  }

  if (panStart) {
    camera.x = panStart.cx + (mx - panStart.sx);
    camera.y = panStart.cy + (my - panStart.sy);
    return;
  }

  const hit = hitNode(mx, my);
  if (hit !== hovered) {
    hovered = hit;
    canvas.style.cursor = hit >= 0 ? 'pointer' : 'grab';
  }

  if (hit >= 0) {
    const nd = nodes[hit];
    const rel = nd.filePath.replace(${JSON.stringify(wsPath)}.replace(/\\\\/g,'/') + '/', '').replace(/\\\\/g,'/');
    tooltip.innerHTML = '<b>' + nd.label + '</b><br/>'
      + '<span style="opacity:.65;font-size:10px">' + rel + '</span>';
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top  = (e.clientY - 6)  + 'px';
  } else {
    tooltip.style.display = 'none';
  }
});

canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const hit = hitNode(mx, my);
  pressing = true;

  if (hit >= 0) {
    dragNode = hit;
    nodes[hit].pinned = true;
    alpha = Math.max(alpha, 0.5);
  } else {
    panStart = { sx: mx, sy: my, cx: camera.x, cy: camera.y };
    canvas.style.cursor = 'grabbing';
  }
});

window.addEventListener('mouseup', e => {
  if (dragNode >= 0) {
    nodes[dragNode].pinned = false;
    dragNode = -1;
  }
  if (panStart) {
    panStart = null;
    canvas.style.cursor = hovered >= 0 ? 'pointer' : 'grab';
  }
  pressing = false;
});

canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const hit = hitNode(mx, my);
  selected = hit;
  if (hit >= 0) {
    const nd = nodes[hit];
    document.getElementById('st-selected').textContent = '● ' + nd.label;
  } else {
    document.getElementById('st-selected').textContent = '';
  }
});

canvas.addEventListener('dblclick', e => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const hit = hitNode(mx, my);
  if (hit >= 0) {
    vscode.postMessage({ type: 'openFile', path: nodes[hit].filePath });
  }
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.12 : 0.89;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const dpr = devicePixelRatio;
  const cx  = canvas.width  / 2 / dpr + camera.x;
  const cy  = canvas.height / 2 / dpr + camera.y;
  // Zoom toward cursor
  const wx = (mx - cx) / camera.zoom;
  const wy = (my - cy) / camera.zoom;
  camera.zoom = Math.max(0.05, Math.min(8, camera.zoom * factor));
  camera.x = mx - wx * camera.zoom - canvas.width / 2 / dpr;
  camera.y = my - wy * camera.zoom - canvas.height / 2 / dpr;
}, { passive: false });

// Pinch-zoom (trackpad)
canvas.addEventListener('gesturechange', e => {
  e.preventDefault();
  camera.zoom = Math.max(0.05, Math.min(8, camera.zoom * e.scale));
}, { passive: false });

// ── Toolbar ──────────────────────────────────────────────────────────────────
document.getElementById('btn-refresh').addEventListener('click', () => {
  document.getElementById('loading').style.display = 'flex';
  vscode.postMessage({ type: 'refresh', showFns });
});

document.getElementById('btn-fit').addEventListener('click', fitView);

document.getElementById('btn-fns').addEventListener('click', function() {
  showFns = !showFns;
  this.classList.toggle('active', showFns);
  applyFilter();
});

document.getElementById('btn-panel').addEventListener('click', () => {
  vscode.postMessage({ type: 'openPanel' });
});

document.getElementById('search').addEventListener('input', function() {
  filterText = this.value;
  applyFilter();
});

// Custom Color Picker
const colorPopup = document.getElementById('color-picker-popup');
const colorHexInput = document.getElementById('color-hex-input');
const colorNativeInput = document.getElementById('color-native-input');
const colorPreview = document.getElementById('color-preview');
let activeColorType = null;

function selectColor(color) {
  if (activeColorType) {
    COLORS[activeColorType] = color;
    const dot = document.querySelector('.leg[data-type="' + activeColorType + '"] .dot');
    if (dot) dot.style.background = color;
    colorHexInput.value = color;
    colorNativeInput.value = color;
    colorPreview.style.background = color;
    applyFilter();
    var colorsObj = {};
    colorsObj[activeColorType] = color;
    vscode.postMessage({ type: 'saveColors', colors: colorsObj });
  }
}

colorNativeInput.addEventListener('input', function() {
  selectColor(this.value);
});

colorHexInput.addEventListener('input', function() {
  var val = this.value;
  if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
    selectColor(val);
  }
});

function showColorPopup(leg) {
  document.querySelectorAll('.leg').forEach(l => l.classList.remove('active'));
  leg.classList.add('active');
  const type = leg.dataset.type;
  activeColorType = type;
  const currentColor = COLORS[type];
  colorHexInput.value = currentColor;
  colorNativeInput.value = currentColor;
  colorPreview.style.background = currentColor;
  
  const rect = leg.getBoundingClientRect();
  const popupWidth = 200;
  const popupHeight = 130;
  
  let left = rect.left - popupWidth + 30;
  let top = rect.top - popupHeight - 10;
  
  if (left < 10) left = 10;
  if (top < 10) top = rect.bottom + 10;
  
  colorPopup.style.display = 'flex';
  colorPopup.style.left = left + 'px';
  colorPopup.style.top = top + 'px';
}

document.querySelectorAll('.leg').forEach(leg => {
  leg.addEventListener('click', (e) => {
    e.stopPropagation();
    showColorPopup(leg);
  });
});

document.addEventListener('click', (e) => {
  if (!colorPopup.contains(e.target) && !e.target.closest('.leg')) {
    colorPopup.style.display = 'none';
    document.querySelectorAll('.leg').forEach(l => l.classList.remove('active'));
  }
});

window.addEventListener('resize', () => {
  colorPopup.style.display = 'none';
  document.querySelectorAll('.leg').forEach(l => l.classList.remove('active'));
});

// Settings button
document.getElementById('btn-settings').addEventListener('click', () => {
  vscode.postMessage({ type: 'openSettings' });
});

function fitView() {
  if (nodes.length === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const nd of nodes) {
    minX = Math.min(minX, nd.x); minY = Math.min(minY, nd.y);
    maxX = Math.max(maxX, nd.x); maxY = Math.max(maxY, nd.y);
  }
  const dpr = devicePixelRatio;
  const W = canvas.width / dpr, H = canvas.height / dpr;
  const pad = 60;
  const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
  const zoom = Math.min((W - pad * 2) / rangeX, (H - pad * 2) / rangeY, 4);
  camera.zoom = zoom;
  camera.x = -(minX + rangeX / 2) * zoom;
  camera.y = -(minY + rangeY / 2) * zoom;
}

// ── Boot ─────────────────────────────────────────────────────────────────────
resize();
vscode.postMessage({ type: 'ready', showFns: false });

})();
</script>
</body>
</html>`;
}

// ─── WebviewViewProvider (Sidebar) ───────────────────────────────────────────

export class CodeGraphProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'ultraview.codeGraph';
  private _view?: vscode.WebviewView;

  constructor(private readonly ctx: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    webviewView.webview.html = buildHtml(wsRoot);

    webviewView.webview.onDidReceiveMessage(msg => this._handleMessage(msg, webviewView.webview));
  }

  // Called by command to open as full editor panel
  static openAsPanel(ctx: vscode.ExtensionContext): void {
    const panel = vscode.window.createWebviewPanel(
      'ultraview.codeGraphPanel',
      'Code Graph',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
    panel.webview.html = buildHtml(wsRoot);
    panel.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'ready' || msg.type === 'refresh') {
        sendGraph(panel.webview, msg.showFns ?? false);
      } else if (msg.type === 'openFile') {
        openFile(msg.path);
      }
      // openPanel from inside a panel = no-op
    });
  }

  private _handleMessage(msg: Record<string, unknown>, webview: vscode.Webview): void {
    switch (msg.type) {
      case 'ready':
      case 'refresh':
        sendGraph(webview, (msg.showFns as boolean) ?? false);
        break;
      case 'openFile':
        openFile(msg.path as string);
        break;
      case 'openPanel':
        vscode.commands.executeCommand('ultraview.openCodeGraph');
        break;
      case 'saveColors':
        this._saveColors(msg.colors as Record<string, string>);
        break;
      case 'openSettings':
        vscode.commands.executeCommand('ultraview.settings.focus');
        break;
    }
  }

  private _saveColors(colors: Record<string, string>): void {
    const config = vscode.workspace.getConfiguration('ultraview');
    const currentColors = config.get<Record<string, string>>('codeGraph.nodeColors') 
      || { ...defaultCodeGraphSettings.nodeColors };
    const mergedColors = { ...currentColors, ...colors };
    config.update('codeGraph.nodeColors', mergedColors, vscode.ConfigurationTarget.Global);
  }

  private _loadColors(): Record<string, string> {
    const config = vscode.workspace.getConfiguration('ultraview');
    return config.get<Record<string, string>>('codeGraph.nodeColors') 
      || { ...defaultCodeGraphSettings.nodeColors };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getColors(): Record<string, string> {
  const config = vscode.workspace.getConfiguration('ultraview');
  return config.get<Record<string, string>>('codeGraph.nodeColors') 
    || { ...defaultCodeGraphSettings.nodeColors };
}

async function sendGraph(webview: vscode.Webview, showFns: boolean): Promise<void> {
  try {
    const data = await buildGraph(showFns);
    const colors = getColors();
    webview.postMessage({ type: 'graphData', ...data, colors });
  } catch (err) {
    vscode.window.showErrorMessage('Code Graph error: ' + String(err));
  }
}

function openFile(filePath: string): void {
  const uri = vscode.Uri.file(filePath);
  vscode.window.showTextDocument(uri, { preview: true, preserveFocus: false });
}
