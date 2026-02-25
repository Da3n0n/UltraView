export function getSvgEditorScript(): string {
  return /* js */`
(function () {
'use strict';
const vscode = acquireVsCodeApi();

// ── DOM refs ────────────────────────────────────────────────────────────
const codeTA      = document.getElementById('svg-code');
const canvas      = document.getElementById('canvas');
const viewport    = document.getElementById('viewport');
const selOverlay  = document.getElementById('sel-overlay');
const inspector   = document.getElementById('inspector');
const inspTag     = document.getElementById('inspector-tag');
const inspBody    = document.getElementById('inspector-body');
const errorBar    = document.getElementById('error-bar');
const errorMsg    = document.getElementById('error-msg');
const viewModeEl  = document.getElementById('view-mode');
const zoomLabel   = document.getElementById('zoom-label');
const statLines   = document.getElementById('stat-lines');
const statSize    = document.getElementById('stat-size');
const statDims    = document.getElementById('stat-dims');
const editPane    = document.getElementById('edit-pane');
const previewPane = document.getElementById('preview-pane');
const editorWrap  = document.getElementById('editor-wrap');

// ── State ────────────────────────────────────────────────────────────────
const initialMode = (typeof window.__SVG_DEFAULT_VIEW__ === 'string')
  ? window.__SVG_DEFAULT_VIEW__ : 'preview';
viewModeEl.value = initialMode;

let currentMode   = initialMode;
let saveTimeout   = null;
let selectedEl    = null;  // currently selected SVG element

// Pan/zoom state
let panX = 0, panY = 0, scale = 1;
const MIN_SCALE = 0.05, MAX_SCALE = 50;

// ── Utilities ────────────────────────────────────────────────────────────
function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n/1024).toFixed(1)+' KB';
  return (n/1048576).toFixed(1)+' MB';
}
function clamp(v,lo,hi){ return Math.min(hi,Math.max(lo,v)); }

// ── Error bar ────────────────────────────────────────────────────────────
function showError(msg) { errorMsg.textContent = msg; errorBar.classList.add('open'); }
function hideError()    { errorBar.classList.remove('open'); }

// ── Pan / Zoom ────────────────────────────────────────────────────────────
function applyTransform() {
  viewport.style.transform = 'translate('+panX+'px,'+panY+'px) scale('+scale+')';
  zoomLabel.textContent = Math.round(scale*100)+'%';
}

function fitToCanvas(svgEl) {
  if (!svgEl) return;
  // get natural size from viewBox or width/height attrs
  let vw, vh;
  const vb = svgEl.getAttribute('viewBox');
  if (vb) {
    const p = vb.trim().split(/[\\s,]+/);
    if (p.length === 4) { vw = parseFloat(p[2]); vh = parseFloat(p[3]); }
  }
  if (!vw || !vh) {
    const wAttr = parseFloat(svgEl.getAttribute('width'));
    const hAttr = parseFloat(svgEl.getAttribute('height'));
    if (!isNaN(wAttr) && !isNaN(hAttr)) { vw = wAttr; vh = hAttr; }
  }
  // fall back to rendered bounding box
  if (!vw || !vh) {
    const bb = svgEl.getBoundingClientRect();
    vw = bb.width || 200; vh = bb.height || 200;
  }

  const cw = canvas.clientWidth  || 400;
  const ch = canvas.clientHeight || 300;
  const pad = 40;
  const sx = (cw - pad*2) / vw;
  const sy = (ch - pad*2) / vh;
  scale = clamp(Math.min(sx,sy), MIN_SCALE, MAX_SCALE);
  panX  = (cw - vw * scale) / 2;
  panY  = (ch - vh * scale) / 2;
  applyTransform();
}

function zoomBy(factor, cx, cy) {
  const newScale = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
  const realCx = cx !== undefined ? cx : canvas.clientWidth  / 2;
  const realCy = cy !== undefined ? cy : canvas.clientHeight / 2;
  panX = realCx - (realCx - panX) * (newScale / scale);
  panY = realCy - (realCy - panY) * (newScale / scale);
  scale = newScale;
  applyTransform();
}

// Wheel: scroll=pan, Ctrl+scroll=zoom
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
    const rect = canvas.getBoundingClientRect();
    zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top);
  } else {
    panX -= e.deltaX;
    panY -= e.deltaY;
    applyTransform();
  }
}, { passive: false });

// Mouse drag to pan
let dragging = false, dragStartX=0, dragStartY=0, panStartX=0, panStartY=0;
let didDrag = false;

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  dragging = true; didDrag = false;
  dragStartX = e.clientX; dragStartY = e.clientY;
  panStartX  = panX;      panStartY  = panY;
  canvas.classList.add('grabbing');
});
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (Math.abs(dx)+Math.abs(dy) > 4) didDrag = true;
  panX = panStartX + dx;
  panY = panStartY + dy;
  applyTransform();
});
window.addEventListener('mouseup', () => {
  dragging = false;
  canvas.classList.remove('grabbing');
});

// ── SVG Render ────────────────────────────────────────────────────────────
let currentSvgEl = null;

function renderPreview(preserveView) {
  const src = codeTA.value.trim();
  if (!src) {
    viewport.innerHTML = '';
    currentSvgEl = null;
    statDims.textContent = '';
    hideError();
    return;
  }

  // Strip XML/DOCTYPE prolog for check
  const stripped = src
    .replace(/^<\\?xml[^>]*\\?>\\s*/im,'')
    .replace(/^<!DOCTYPE[^>]*>\\s*/im,'');

  if (!/^<svg[\\s>/]/i.test(stripped)) {
    showError('Not a valid SVG file (<svg> root not found).');
    return;
  }
  hideError();

  try {
    // DOMParser is available in VS Code webviews
    const parser = new DOMParser();
    const doc = parser.parseFromString(src, 'image/svg+xml');
    const parseErr = doc.querySelector('parsererror');
    if (parseErr) {
      showError('XML parse error: ' + parseErr.textContent.split('\\n')[0]);
      return;
    }
    hideError();

    const svgEl = doc.documentElement;

    // Make SVG not fight our transform: remove hard px width/height
    // but keep viewBox so it can scale properly
    const vb = svgEl.getAttribute('viewBox');
    if (vb) {
      const parts = vb.trim().split(/[\\s,]+/);
      if (parts.length === 4) {
        const nw = parseFloat(parts[2]), nh = parseFloat(parts[3]);
        if (!isNaN(nw) && !isNaN(nh)) {
          svgEl.setAttribute('width',  nw);
          svgEl.setAttribute('height', nh);
          statDims.textContent = nw + ' × ' + nh + ' px';
        }
      }
    } else {
      const wa = parseFloat(svgEl.getAttribute('width'));
      const ha = parseFloat(svgEl.getAttribute('height'));
      if (!isNaN(wa) && !isNaN(ha)) {
        statDims.textContent = wa + ' × ' + ha + ' px';
      } else {
        statDims.textContent = '';
      }
    }

    // Remove fill=none that makes the entire SVG transparent to clicks
    // We'll handle hit testing ourselves

    viewport.innerHTML = '';
    viewport.appendChild(doc.documentElement.cloneNode ? doc.documentElement : svgEl);
    currentSvgEl = viewport.querySelector('svg');

    // Re-attach click handler for selection
    attachSelectionHandlers();

    if (!preserveView) {
      // Give browser one tick to lay out
      requestAnimationFrame(() => fitToCanvas(currentSvgEl));
    }
  } catch(err) {
    showError('Render error: ' + err.message);
  }
}

// ── Element selection & inspector ─────────────────────────────────────────

function attachSelectionHandlers() {
  if (!currentSvgEl) return;
  // Use event delegation on the viewport svg
  currentSvgEl.addEventListener('click', handleSvgClick);
}

function handleSvgClick(e) {
  // Only handle click (not end of a pan drag)
  if (didDrag) return;
  e.stopPropagation();

  let target = e.target;
  // Walk up to something useful (not the svg root itself unless nothing else)
  if (target === currentSvgEl) {
    deselectElement();
    return;
  }

  selectElement(target);
}

function selectElement(el) {
  selectedEl = el;

  // Draw selection overlay
  const rect = el.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  selOverlay.style.display = 'block';
  selOverlay.style.left   = (rect.left - canvasRect.left) + 'px';
  selOverlay.style.top    = (rect.top  - canvasRect.top)  + 'px';
  selOverlay.style.width  = rect.width  + 'px';
  selOverlay.style.height = rect.height + 'px';

  // Open inspector
  openInspector(el);
}

function deselectElement() {
  selectedEl = null;
  selOverlay.style.display = 'none';
  inspector.classList.remove('open');
}

// Deselect on canvas background click
canvas.addEventListener('click', e => {
  if (e.target === canvas || e.target === viewport) {
    deselectElement();
  }
});

// ── Inspector ─────────────────────────────────────────────────────────────

function openInspector(el) {
  const tag = el.tagName.toLowerCase().replace(/^svg:/, '');
  inspTag.innerHTML = '<span class="tag-badge">&lt;' + tag + '&gt;</span>';
  buildInspectorRows(el);
  inspector.classList.add('open');
}

function buildInspectorRows(el) {
  inspBody.innerHTML = '';

  const attrs = Array.from(el.attributes);
  if (attrs.length === 0) {
    inspBody.innerHTML = '<div style="padding:8px 10px;color:var(--muted)">No attributes</div>';
    return;
  }

  attrs.forEach(attr => {
    const row = document.createElement('div');
    row.className = 'attr-row';

    const keyEl = document.createElement('div');
    keyEl.className = 'attr-key';
    keyEl.title = attr.name;
    keyEl.textContent = attr.name;

    const valEl = document.createElement('input');
    valEl.className = 'attr-val';
    valEl.value = attr.value;
    valEl.title = attr.value;

    valEl.addEventListener('input', () => {
      el.setAttribute(attr.name, valEl.value);
      // Update position overlay
      if (selectedEl === el) {
        const rect = el.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        selOverlay.style.left   = (rect.left - canvasRect.left) + 'px';
        selOverlay.style.top    = (rect.top  - canvasRect.top)  + 'px';
        selOverlay.style.width  = rect.width  + 'px';
        selOverlay.style.height = rect.height + 'px';
      }
      // Sync back to the code textarea
      scheduleCodeSync();
    });

    valEl.addEventListener('blur', () => {
      valEl.title = valEl.value;
    });

    row.appendChild(keyEl);
    row.appendChild(valEl);
    inspBody.appendChild(row);
  });
}

// Schedule serialisation of the viewport SVG back to the textarea
let codeSyncTimeout = null;

function scheduleCodeSync() {
  clearTimeout(codeSyncTimeout);
  codeSyncTimeout = setTimeout(() => {
    if (!currentSvgEl) return;
    // Serialize only the SVG element, not the entire viewport div
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(currentSvgEl);
    codeTA.value = svgStr;
    updateStats();
    autoSave();
  }, 120);
}

// ── Stats ─────────────────────────────────────────────────────────────────

function updateStats() {
  const val = codeTA.value;
  statLines.textContent = 'Lines: ' + val.split('\\n').length;
  statSize.textContent  = 'Size: '  + fmtBytes(new TextEncoder().encode(val).length);
}

// ── Save ──────────────────────────────────────────────────────────────────

function save() { vscode.postMessage({ type: 'save', content: codeTA.value }); }
function autoSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(save, 800);
}

// ── Toolbar buttons ───────────────────────────────────────────────────────

document.getElementById('btn-fit').addEventListener('click', () => {
  fitToCanvas(currentSvgEl);
});
document.getElementById('btn-actual').addEventListener('click', () => {
  scale = 1;
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  const svgEl = currentSvgEl;
  if (svgEl) {
    const w = parseFloat(svgEl.getAttribute('width'))  || 200;
    const h = parseFloat(svgEl.getAttribute('height')) || 200;
    panX = (cw - w) / 2;
    panY = (ch - h) / 2;
  } else {
    panX = cw/2; panY = ch/2;
  }
  applyTransform();
});
document.getElementById('btn-zoom-in').addEventListener('click',  () => zoomBy(1.3));
document.getElementById('btn-zoom-out').addEventListener('click', () => zoomBy(1/1.3));

// Keyboard zoom shortcuts
window.addEventListener('keydown', e => {
  if (e.target === codeTA) return; // don't intercept in code editor
  if (e.key === '+' || e.key === '=') zoomBy(1.2);
  if (e.key === '-') zoomBy(1/1.2);
  if (e.key === 'f' || e.key === 'F') fitToCanvas(currentSvgEl);
  if (e.key === '1') { zoomBy(1/scale); } // reset to 100%
  if (e.key === 'Escape') deselectElement();
  if ((e.ctrlKey||e.metaKey) && e.key === '0') { e.preventDefault(); fitToCanvas(currentSvgEl); }
  if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
});

// Checkerboard toggle
let checkerOn = true;
document.getElementById('btn-checker').addEventListener('click', () => {
  checkerOn = !checkerOn;
  canvas.classList.toggle('no-checker', !checkerOn);
});

// Inspector close
document.getElementById('inspector-close').addEventListener('click', deselectElement);

// ── View mode ─────────────────────────────────────────────────────────────

function applyMode(mode) {
  currentMode = mode;
  editPane.classList.remove('visible');
  previewPane.classList.remove('visible');

  if (mode === 'text') {
    editPane.classList.add('visible');
    editPane.style.flex = '1';
    codeTA.focus();
    deselectElement();
  } else if (mode === 'preview') {
    previewPane.classList.add('visible');
    previewPane.style.flex = '1';
    renderPreview(false);
  } else { // split
    editPane.classList.add('visible');
    previewPane.classList.add('visible');
    editPane.style.flex   = '0 0 45%';
    previewPane.style.flex = '1';
    renderPreview(false);
    codeTA.focus();
  }
}

viewModeEl.addEventListener('change', () => {
  applyMode(viewModeEl.value);
});

// ── Code textarea input ───────────────────────────────────────────────────

let renderTimeout = null;
codeTA.addEventListener('input', () => {
  updateStats();
  autoSave();
  if (currentMode !== 'text') {
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => renderPreview(true), 150);
  }
});

codeTA.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = codeTA.selectionStart, en = codeTA.selectionEnd;
    codeTA.value = codeTA.value.substring(0,s) + '  ' + codeTA.value.substring(en);
    codeTA.selectionStart = codeTA.selectionEnd = s + 2;
    updateStats(); autoSave();
    if (currentMode !== 'text') renderPreview(true);
  }
  if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  if ((e.ctrlKey||e.metaKey) && e.key === '0') { e.preventDefault(); fitToCanvas(currentSvgEl); }
});

// ── Messages from extension host ──────────────────────────────────────────

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'setContent') {
    codeTA.value = msg.content;
    updateStats();
    if (currentMode !== 'text') {
      // fit on first load
      renderPreview(false);
    }
  }
});

// ── Init ──────────────────────────────────────────────────────────────────

applyMode(currentMode);
vscode.postMessage({ type: 'ready' });
})();
`;
}
